import { NextResponse } from "next/server";
import { loadBatch } from "@/lib/services/batchService";
import { watermarkRequiresRealVideoMessage } from "@/lib/services/videoAssetValidation";
import { hasRealGeneratedVideoAsset, sendSuccessfulVideosToWatermark } from "@/lib/services/watermarkConnector";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const batch = await loadBatch(String(body.batchId));
    if (!batch.items.some(hasRealGeneratedVideoAsset)) {
      return NextResponse.json({
        ok: false,
        errorCode: "REAL_VIDEO_REQUIRED",
        message: watermarkRequiresRealVideoMessage
      }, { status: 400 });
    }
    const updated = await sendSuccessfulVideosToWatermark(batch, body.mock !== false);
    return NextResponse.json({ ok: true, batch: updated });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unknown error" }, { status: 400 });
  }
}
