import path from "node:path";
import { NextResponse } from "next/server";
import { createVideoFactoryAdapter, mirrorResultFile } from "@/integrations/videofactory/videoFactoryAdapter";
import { batchRunDir, loadBatch, saveBatch, writeBatchArtifact } from "@/services/batchService";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const batch = await loadBatch(String(body.batchId));
    if (!batch.videoFactory.promptDir) {
      throw new Error("Prompt dir has not been exported for this batch.");
    }
    const remote = Boolean(body.remote);
    const dryRun = body.dryRun !== false || !remote;
    if (remote && !dryRun && body.confirmRemote !== true) {
      throw new Error("Remote image submission requires explicit confirmation.");
    }
    if (remote && Number(body.limit || 1) > 1 && body.confirmFullBatch !== true) {
      throw new Error("Full batch image submission requires explicit Run Full Batch confirmation.");
    }
    await saveBatch({ ...batch, status: "image_submitting" });
    const adapter = createVideoFactoryAdapter();
    const result = await adapter.submitImages({
      promptDir: batch.videoFactory.promptDir,
      remote,
      dryRun,
      limit: Number(body.limit || 1),
      modelLimit: Number(body.modelLimit || 1),
      models: body.models,
      batchId: batch.id,
    });
    const target = path.join(batchRunDir(batch.id), "video_factory_image_result.json");
    await mirrorResultFile(result.manifestPath, target);
    const updated = await saveBatch({
      ...await loadBatch(batch.id),
      status: result.ok ? "image_submitted" : "failed",
      videoFactory: {
        ...(await loadBatch(batch.id)).videoFactory,
        resultManifestPath: target,
      },
      items: (await loadBatch(batch.id)).items.map((item) => ({
        ...item,
        referenceImage: {
          ...item.referenceImage,
          status: result.ok ? "submitted" : "failed",
          errorCode: result.ok ? undefined : "IMAGE_SUBMIT_FAILED",
          errorMessage: result.ok ? undefined : result.stderr || result.stdout,
        },
      })),
    });
    await writeBatchArtifact(updated, "image_submit_command.json", `${JSON.stringify(result, null, 2)}\n`);
    return NextResponse.json({ ok: result.ok, batch: updated, result });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unknown error" }, { status: 400 });
  }
}
