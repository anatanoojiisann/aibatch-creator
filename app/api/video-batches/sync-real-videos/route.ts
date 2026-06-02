import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { loadBatch, saveBatch } from "@/lib/services/batchService";
import { isRealMp4Url } from "@/lib/services/videoAssetValidation";
import { PixVerseOfficialAdapter } from "@/lib/providers/pixverseOfficial/pixverseOfficialAdapter";
import { getProviderDefinition } from "@/lib/providers/providerRegistry";
import { assertProviderVideoTaskScope } from "@/lib/providers/providerTask";

export async function POST(request: Request) {
  try {
    const { batchId } = await request.json();
    const batch = await loadBatch(String(batchId));
    const submittedItems = batch.items.filter((item) =>
      item.generation.status === "waiting_for_real_video_output"
      || item.generation.status === "video_submitted"
      || item.generation.status === "video_generating");
    if (submittedItems.length === 0) {
      return NextResponse.json({
        ok: false,
        errorCode: "REAL_VIDEO_SUBMISSION_MISSING",
        message: "Submit a real VideoFactory image-to-video job before syncing real video output."
      }, { status: 400 });
    }
    const providerScopedItem = submittedItems.find((item) => item.generation.providerId);
    if (providerScopedItem) return syncProviderScopedVideo(batch, providerScopedItem);

    const submissions = await readSubmissions(batch.videoFactory.videoResultJsonPath);
    const lastSyncAt = new Date().toISOString();
    const items = batch.items.map((item) => {
      if (!submittedItems.some((submitted) => submitted.id === item.id)) return item;
      const submission = submissions.find((entry) => itemIdFor(entry) === item.id);
      const response = submission?.response || {};
      const videoUrl = String(response.videoUrl || response.url || submission?.videoUrl || "");
      const attempts = (item.generation.syncAttempts || 0) + 1;
      if (isRealMp4Url(videoUrl)) {
        return {
          ...item,
          generation: {
            ...item.generation,
            status: "video_succeeded" as const,
            videoUrl,
            lastSyncAt,
            syncAttempts: attempts,
            errorCode: undefined,
            errorMessage: undefined
          }
        };
      }
      const delayedMessage = attempts >= 5
        ? "No real video asset after 5 sync attempts. The provider may still be processing or the job may be delayed. Check remote task status."
        : "Real video job is still running. Try Sync Real Videos Again in 30–60 seconds.";
      return {
        ...item,
        generation: {
          ...item.generation,
          status: submission?.ok === false ? "video_failed" as const : "waiting_for_real_video_output" as const,
          lastSyncAt,
          syncAttempts: attempts,
          errorCode: submission?.ok === false ? "VIDEO_SUBMIT_FAILED" : "WAITING_FOR_REAL_VIDEO_OUTPUT",
          errorMessage: submission?.ok === false
            ? String(submission.error || submission.message || response.message || "VideoFactory real video submission failed.")
            : delayedMessage
        }
      };
    });
    const hasRealVideo = items.some((item) => item.generation.status === "video_succeeded");
    const updated = await saveBatch({ ...batch, status: hasRealVideo ? "video_ready" : "video_generating", items });
    return NextResponse.json({
      ok: true,
      batch: updated,
      message: hasRealVideo
        ? "Real video output is ready."
        : "Real video job is still running. Try Sync Real Videos Again in 30–60 seconds.",
      syncCapability: "VideoFactory currently exposes submission results but no provider video polling or MP4 download script. Stored submission results were inspected without deleting remote data."
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      errorCode: "SYNC_REAL_VIDEOS_FAILED",
      message: error instanceof Error ? error.message : "Unknown error"
    }, { status: 400 });
  }
}

async function syncProviderScopedVideo(
  batch: Awaited<ReturnType<typeof loadBatch>>,
  item: Awaited<ReturnType<typeof loadBatch>>["items"][number]
) {
  const providerId = item.generation.providerId;
  if (!providerId || !item.generation.providerTaskId) {
    return NextResponse.json({ ok: false, errorCode: "PROVIDER_TASK_ID_MISSING", providerId, message: "Provider task ID is required before syncing." }, { status: 400 });
  }
  if (!item.generation.providerGroup || !item.generation.providerSource || !item.generation.accountScope) {
    return NextResponse.json({ ok: false, errorCode: "PROVIDER_TASK_SCOPE_MISSING", providerId, message: "Provider task scope metadata is required before syncing." }, { status: 400 });
  }
  assertProviderVideoTaskScope({
    providerId,
    providerGroup: item.generation.providerGroup,
    providerSource: item.generation.providerSource,
    accountScope: item.generation.accountScope,
    providerTaskId: item.generation.providerTaskId
  }, getProviderDefinition(providerId));
  if (providerId !== "pixverse_official_api") {
    return NextResponse.json({
      ok: false,
      errorCode: "PROVIDER_CAPABILITY_UNSUPPORTED",
      providerId,
      capability: "video_status",
      message: `${getProviderDefinition(providerId).label} video status sync is not configured.`
    }, { status: 400 });
  }
  if (!process.env.PIXVERSE_OFFICIAL_API_KEY) {
    return NextResponse.json({ ok: false, errorCode: "PROVIDER_CREDENTIAL_MISSING", providerId, message: "PIXVERSE_OFFICIAL_API_KEY is required for PixVerse Official API status sync." }, { status: 400 });
  }
  const result = await new PixVerseOfficialAdapter().getVideoStatus(item.generation.providerTaskId);
  const lastSyncAt = new Date().toISOString();
  const syncAttempts = (item.generation.syncAttempts || 0) + 1;
  const updated = await saveBatch({
    ...batch,
    status: result.status === "video_succeeded" ? "video_ready" : result.status === "video_generating" ? "video_generating" : "failed",
    items: batch.items.map((entry) => entry.id === item.id ? {
      ...entry,
      generation: {
        ...entry.generation,
        status: result.status,
        videoUrl: result.videoUrl || entry.generation.videoUrl,
        providerRawStatus: result.providerRawStatus,
        providerRawResponse: result.rawResponse,
        lastSyncAt,
        syncAttempts,
        errorCode: result.status === "video_succeeded" ? undefined : entry.generation.errorCode,
        errorMessage: result.status === "video_succeeded" ? undefined : entry.generation.errorMessage
      }
    } : entry)
  });
  return NextResponse.json({ ok: true, batch: updated, providerId, message: result.status === "video_succeeded" ? "Real provider video output is ready." : "Real provider video job is still running." });
}

async function readSubmissions(filePath: string | undefined): Promise<Array<Record<string, any>>> {
  if (!filePath || !existsSync(filePath)) return [];
  const data = JSON.parse(await readFile(filePath, "utf8")) as { submissions?: Array<Record<string, any>> };
  return data.submissions || [];
}

function itemIdFor(submission: Record<string, any>): string {
  return String(submission.itemId || submission.body?.metadata?.factory_item_id || "");
}
