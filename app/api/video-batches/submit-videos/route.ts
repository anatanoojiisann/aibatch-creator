import { existsSync } from "node:fs";
import { NextResponse } from "next/server";
import { createVideoFactoryAdapter, writeCommandManifest } from "@/lib/integrations/videofactory/videoFactoryAdapter";
import { loadBatch, saveBatch } from "@/lib/services/batchService";
import { validateVideoSubmitPrerequisites } from "@/lib/services/videoSubmissionGuard";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const batch = await loadBatch(String(body.batchId));
    const validation = validateVideoSubmitPrerequisites(
      batch,
      Boolean(batch.videoFactory.imageUrlMapPath && existsSync(batch.videoFactory.imageUrlMapPath))
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
    await saveBatch({ ...batch, status: "video_submitting" });
    const result = await createVideoFactoryAdapter().submitVideos({
      promptDir,
      imageUrlMapPath,
      remote: Boolean(body.remote),
      dryRun: body.dryRun !== false,
      limit: Number(body.limit || 1),
      confirmedRemote: body.confirmRemote === true,
      confirmedFullBatch: body.confirmFullBatch === true
    });
    const manifestPath = await writeCommandManifest(batch.id, "video_factory_video_result.json", result);
    const current = await loadBatch(batch.id);
    const updated = await saveBatch({
      ...current,
      status: result.ok ? "video_generating" : "failed",
      videoFactory: { ...current.videoFactory, resultManifestPath: manifestPath },
      items: current.items.map((item) => eligible.some((entry) => entry.id === item.id)
        ? { ...item, generation: { ...item.generation, status: result.ok ? "video_submitted" : "video_failed" } }
        : item)
    });
    return NextResponse.json({ ok: result.ok, batch: updated, result });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      errorCode: "SUBMIT_VIDEOS_FAILED",
      message: error instanceof Error ? error.message : "Unknown error",
      missingRequirements: []
    }, { status: 400 });
  }
}
