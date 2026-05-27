import { NextResponse } from "next/server";
import { loadBatch } from "@/services/batchService";
import { sendBatchToWatermark } from "@/services/watermarkConnector";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const batch = await loadBatch(String(body.batchId));
    const updated = await sendBatchToWatermark(batch, body.mode || "extra_fast", body.mock !== false);
    return NextResponse.json({ ok: true, batch: updated });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unknown error" }, { status: 400 });
  }
}
