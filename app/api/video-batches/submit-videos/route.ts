import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { createVideoFactoryAdapter, summarizeVideoFactoryCommandResult, writeCommandManifest } from "@/lib/integrations/videofactory/videoFactoryAdapter";
import { VideoFactoryVideoSubmission } from "@/lib/integrations/videofactory/videoFactoryTypes";
import { PixVerseOfficialAdapter } from "@/lib/providers/pixverseOfficial/pixverseOfficialAdapter";
import { getProviderDefinition, isProviderId } from "@/lib/providers/providerRegistry";
import { ProviderId } from "@/lib/providers/providerTypes";
import { validateSelectedProviderVideoSubmission } from "@/lib/providers/providerVideoSubmission";
import { loadBatch, saveBatch } from "@/lib/services/batchService";
import { isRealMp4Url, mockVideoMessage } from "@/lib/services/videoAssetValidation";
import { validateVideoSubmitPrerequisites } from "@/lib/services/videoSubmissionGuard";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const batch = await loadBatch(String(body.batchId));
    const realMode = body.mode === "real";
    const providerId = isProviderId(body.providerId)
      ? body.providerId
      : batch.providerSetup?.selectedProviderId;
    if (realMode) {
      if (!providerId) {
        return NextResponse.json({ ok: false, errorCode: "PROVIDER_SELECTION_REQUIRED", message: "Select a provider before real video submission." }, { status: 400 });
      }
      return submitSelectedProviderRealVideo(batch, providerId, body.confirmRealRun === true);
    }
    const imageUrlMap = await readImageUrlMap(batch.videoFactory.imageUrlMapPath);
    const validation = validateVideoSubmitPrerequisites(
      batch,
      Boolean(batch.videoFactory.imageUrlMapPath && existsSync(batch.videoFactory.imageUrlMapPath)),
      { requireRealPublicImageUrl: realMode, imageUrlMap }
    );
    if (!validation.ok) {
      return NextResponse.json({
        ok: false,
        errorCode: validation.errorCode,
        message: validation.message,
        missingRequirements: validation.missingRequirements
      }, { status: 400 });
    }

    const eligible = batch.items.filter((item) => item.referenceImage.status === "uploaded_public" && item.referenceImage.publicUrl);
    const promptDir = batch.videoFactory.promptDir as string;
    const imageUrlMapPath = batch.videoFactory.imageUrlMapPath as string;
    const submittedAt = new Date().toISOString();
    await saveBatch({
      ...batch,
      status: "video_submitting",
      items: batch.items.map((item) => eligible.some((entry) => entry.id === item.id)
        ? { ...item, generation: { ...item.generation, status: "video_submitting", submittedAt } }
        : item)
    });

    const result = await createVideoFactoryAdapter().submitVideos({
      batchId: batch.id,
      promptDir,
      imageUrlMapPath,
      bridgeUrl: "https://admin666.aurax.one",
      remote: realMode,
      dryRun: !realMode,
      limit: 1,
      modelLimit: 1,
      confirmedRemote: body.confirmRealRun === true,
      confirmedFullBatch: false
    });
    const manifestPath = await writeCommandManifest(batch.id, "video_factory_video_result.json", result);
    const resultSummary = summarizeVideoFactoryCommandResult(result);
    const current = await loadBatch(batch.id);
    const updatedItems = current.items.map((item) => {
      if (!eligible.some((entry) => entry.id === item.id)) return item;
      const submission = result.submissions?.find((entry) => entry.itemId === item.id);
      if (!realMode) {
        return {
          ...item,
          generation: {
            ...item.generation,
            status: "video_mocked" as const,
            videoJobId: `mock_video_${item.id}`,
            videoUrl: `https://your-domain.example/videos/${current.id}/${item.id}.mp4`,
            submitCommand: result.command,
            resultJsonPath: result.resultJsonPath,
            submittedAt,
            dryRun: true,
            errorCode: "MOCK_VIDEO_ONLY",
            errorMessage: mockVideoMessage
          }
        };
      }
      return applyRealSubmission(item, submission, result.command, result.resultJsonPath, submittedAt);
    });
    const hasRealVideo = updatedItems.some((item) => item.generation.status === "video_succeeded");
    const waitingForRealVideo = updatedItems.some((item) => item.generation.status === "waiting_for_real_video_output");
    const updated = await saveBatch({
      ...current,
      status: !realMode
        ? "image_public_url_ready"
        : hasRealVideo ? "video_ready" : waitingForRealVideo ? "video_generating" : result.ok ? current.status : "failed",
      videoFactory: {
        ...current.videoFactory,
        resultManifestPath: manifestPath,
        videoResultJsonPath: result.resultJsonPath,
        videoSubmitCommand: result.command
      },
      items: updatedItems
    });
    return NextResponse.json({
      ok: result.ok,
      batch: updated,
      result: resultSummary,
      message: realMode
        ? waitingForRealVideo ? "Real video job submitted. Waiting for generated video output. Try Sync Real Videos Again in 30–60 seconds." : "Real video submission processed."
        : mockVideoMessage
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      errorCode: "SUBMIT_VIDEOS_FAILED",
      message: error instanceof Error ? error.message : "Unknown error",
      missingRequirements: []
    }, { status: 400 });
  }
}

async function submitSelectedProviderRealVideo(batch: Awaited<ReturnType<typeof loadBatch>>, providerId: ProviderId, confirmed: boolean) {
  if (!confirmed) {
    return NextResponse.json({ ok: false, errorCode: "REAL_RUN_CONFIRMATION_MISSING", message: "Real provider submission requires explicit confirmation." }, { status: 400 });
  }
  const validation = validateSelectedProviderVideoSubmission(batch, providerId);
  if (!validation.ok) return NextResponse.json(validation, { status: 400 });
  if (providerId !== "pixverse_official_api") {
    return NextResponse.json({
      ok: false,
      errorCode: "PROVIDER_CAPABILITY_UNSUPPORTED",
      providerId,
      capability: "image_to_video",
      message: `${getProviderDefinition(providerId).label} image-to-video execution is not configured.`
    }, { status: 400 });
  }
  if (!process.env.PIXVERSE_OFFICIAL_API_KEY) {
    return NextResponse.json({
      ok: false,
      errorCode: "PROVIDER_CREDENTIAL_MISSING",
      providerId,
      message: "PIXVERSE_OFFICIAL_API_KEY is required for PixVerse Official API submission."
    }, { status: 400 });
  }
  const item = batch.items.find((entry) => entry.id === validation.assets[0].localItemId);
  if (!item || !validation.assets[0].providerAssetId) {
    return NextResponse.json({ ok: false, errorCode: "PROVIDER_ASSET_REQUIRED", providerId, message: "A PixVerse official img_id is required before submission." }, { status: 400 });
  }
  const submittedAt = new Date().toISOString();
  const result = await new PixVerseOfficialAdapter().submitImageToVideo({
    imgId: validation.assets[0].providerAssetId,
    prompt: item.videoPrompt,
    model: "v6",
    duration: 5,
    quality: "540p",
    aspectRatio: batch.aspectRatio
  });
  const provider = getProviderDefinition(providerId);
  const updated = await saveBatch({
    ...batch,
    status: "video_generating",
    providerSetup: { selectedProviderId: providerId },
    items: batch.items.map((entry) => entry.id === item.id ? {
      ...entry,
      generation: {
        ...entry.generation,
        status: "waiting_for_real_video_output",
        providerId,
        providerGroup: provider.group,
        providerSource: provider.source,
        accountScope: provider.accountScope,
        providerTaskId: result.providerTaskId,
        providerAssetId: validation.assets[0].providerAssetId,
        providerRawResponse: result.rawResponse,
        submittedAt,
        dryRun: false,
        syncAttempts: 0,
        errorCode: "WAITING_FOR_REAL_VIDEO_OUTPUT",
        errorMessage: "Real provider video job is still running."
      }
    } : entry)
  });
  return NextResponse.json({ ok: true, batch: updated, providerId, providerTaskId: result.providerTaskId, message: "Real provider video job submitted." });
}

function applyRealSubmission(
  item: Awaited<ReturnType<typeof loadBatch>>["items"][number],
  submission: VideoFactoryVideoSubmission | undefined,
  submitCommand: string,
  resultJsonPath: string | undefined,
  submittedAt: string
) {
  const videoUrl = submission?.videoUrl;
  const videoJobId = submission?.videoJobId;
  if (submission?.ok === false) {
    return {
      ...item,
      generation: {
        ...item.generation,
        status: "video_failed" as const,
        videoJobId,
        submitCommand,
        resultJsonPath,
        submittedAt,
        dryRun: false,
        errorCode: "VIDEO_SUBMIT_FAILED",
        errorMessage: submission.errorMessage || "VideoFactory real video submission failed."
      }
    };
  }
  if (isRealMp4Url(videoUrl)) {
    return {
      ...item,
      generation: {
        ...item.generation,
        status: "video_succeeded" as const,
        videoJobId,
        videoUrl,
        submitCommand,
        resultJsonPath,
        submittedAt,
        dryRun: false,
        syncAttempts: 0
      }
    };
  }
  return {
    ...item,
    generation: {
      ...item.generation,
      status: videoJobId ? "waiting_for_real_video_output" as const : "video_failed" as const,
      videoJobId,
      submitCommand,
      resultJsonPath,
      submittedAt,
      dryRun: false,
      syncAttempts: 0,
      errorCode: videoJobId ? "WAITING_FOR_REAL_VIDEO_OUTPUT" : "VIDEO_TASK_ID_MISSING",
      errorMessage: videoJobId
        ? "Real video job is still running. Try Sync Real Videos Again in 30–60 seconds."
        : "VideoFactory did not return a provider video task ID."
    }
  };
}

async function readImageUrlMap(filePath: string | undefined): Promise<Record<string, string>> {
  if (!filePath || !existsSync(filePath)) return {};
  return JSON.parse(await readFile(filePath, "utf8")) as Record<string, string>;
}
