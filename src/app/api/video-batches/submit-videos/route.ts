import path from "node:path";
import { NextResponse } from "next/server";
import { createVideoFactoryAdapter, mirrorResultFile } from "@/integrations/videofactory/videoFactoryAdapter";
import { batchRunDir, loadBatch, saveBatch, writeBatchArtifact } from "@/services/batchService";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const batch = await loadBatch(String(body.batchId));
    if (!batch.videoFactory.promptDir || !batch.videoFactory.imageUrlMapPath) {
      throw new Error("Prompt dir and image-url-map.json are required before video submission.");
    }
    const eligible = batch.items.filter((item) => item.referenceImage.publicUrl && item.referenceImage.status === "uploaded_public");
    if (eligible.length === 0) {
      throw new Error("No approved items with public image URLs are ready for video submission.");
    }
    const remote = Boolean(body.remote);
    const dryRun = body.dryRun !== false || !remote;
    if (remote && !dryRun && body.confirmRemote !== true) {
      throw new Error("Remote video submission requires explicit confirmation.");
    }
    if (remote && Number(body.limit || 1) > 1 && body.confirmFullBatch !== true) {
      throw new Error("Full batch video submission requires explicit Run Full Batch confirmation.");
    }
    await saveBatch({ ...batch, status: "video_submitting" });
    const adapter = createVideoFactoryAdapter();
    const result = await adapter.submitVideos({
      promptDir: batch.videoFactory.promptDir,
      imageUrlMapPath: batch.videoFactory.imageUrlMapPath,
      remote,
      dryRun,
      limit: Number(body.limit || 1),
      batchId: batch.id,
    });
    const target = path.join(batchRunDir(batch.id), "video_factory_video_result.json");
    await mirrorResultFile(result.manifestPath, target);
    const current = await loadBatch(batch.id);
    const updated = await saveBatch({
      ...current,
      status: result.ok ? "video_generating" : "failed",
      items: current.items.map((item) => {
        if (!eligible.some((eligibleItem) => eligibleItem.id === item.id)) return item;
        return {
          ...item,
          generation: {
            ...item.generation,
            status: result.ok ? "video_submitted" : "video_failed",
            errorCode: result.ok ? undefined : "VIDEO_SUBMIT_FAILED",
            errorMessage: result.ok ? undefined : result.stderr || result.stdout,
          },
        };
      }),
    });
    await writeBatchArtifact(updated, "video_submit_command.json", `${JSON.stringify(result, null, 2)}\n`);
    return NextResponse.json({ ok: result.ok, batch: updated, result });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unknown error" }, { status: 400 });
  }
}
