import { NextResponse } from "next/server";
import { createVideoFactoryAdapter, writeCommandManifest } from "@/lib/integrations/videofactory/videoFactoryAdapter";
import { loadBatch, saveBatch } from "@/lib/services/batchService";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const batch = await loadBatch(String(body.batchId));
    const eligible = batch.items.filter((item) => item.referenceImage.status === "uploaded_public" && item.referenceImage.publicUrl);
    if (eligible.length === 0) throw new Error("No approved uploaded images with publicUrl are eligible for video submission.");
    if (!batch.videoFactory.promptDir || !batch.videoFactory.imageUrlMapPath) {
      throw new Error("Prompt dir and image-url-map.json are required before submit-videos.");
    }
    await saveBatch({ ...batch, status: "video_submitting" });
    const result = await createVideoFactoryAdapter().submitVideos({
      promptDir: batch.videoFactory.promptDir,
      imageUrlMapPath: batch.videoFactory.imageUrlMapPath,
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
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unknown error" }, { status: 400 });
  }
}
