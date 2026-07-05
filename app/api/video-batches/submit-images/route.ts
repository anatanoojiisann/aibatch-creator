import { NextResponse } from "next/server";
import { createVideoFactoryAdapter, summarizeVideoFactoryCommandResult, writeCommandManifest } from "@/lib/integrations/videofactory/videoFactoryAdapter";
import { loadBatch, saveBatch } from "@/lib/services/batchService";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const batch = await loadBatch(String(body.batchId));
    if (!batch.videoFactory.promptDir) throw new Error("Export prompt-dir before submitting images.");
    await saveBatch({ ...batch, status: "image_submitting" });
    const result = await createVideoFactoryAdapter().submitImages({
      promptDir: batch.videoFactory.promptDir,
      remote: Boolean(body.remote),
      dryRun: body.dryRun !== false,
      limit: Number(body.limit || 1),
      modelLimit: Number(body.modelLimit || 1),
      confirmedRemote: body.confirmRemote === true,
      confirmedFullBatch: body.confirmFullBatch === true
    });
    const manifestPath = await writeCommandManifest(batch.id, "video_factory_image_result.json", result);
    const resultSummary = summarizeVideoFactoryCommandResult(result);
    const current = await loadBatch(batch.id);
    const submitted = result.ok ? current.items.length : 0;
    const updated = await saveBatch({
      ...current,
      status: result.ok ? "image_submitted" : "failed",
      videoFactory: { ...current.videoFactory, resultManifestPath: manifestPath },
      items: current.items.map((item) => ({
        ...item,
        referenceImage: {
          ...item.referenceImage,
          status: result.ok ? "submitted" : "failed",
          errorCode: result.ok ? undefined : "IMAGE_SUBMIT_FAILED",
          errorMessage: result.ok ? undefined : resultSummary.stderr || resultSummary.stdout
        }
      }))
    });
    return NextResponse.json({
      ok: result.ok,
      batch: updated,
      batchId: batch.id,
      submitted,
      dryRun: body.dryRun !== false,
      resultPath: manifestPath,
      message: result.ok ? `Submitted ${submitted} image prompt item(s) in dry-run/mock mode.` : "Image submission failed.",
      result: resultSummary
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      errorCode: "SUBMIT_IMAGES_FAILED",
      message: error instanceof Error ? error.message : "Unknown error",
      missingRequirements: ["Prompt dir exported"]
    }, { status: 400 });
  }
}
