import { NextResponse } from "next/server";
import { createVideoFactoryAdapter } from "@/integrations/videofactory/videoFactoryAdapter";
import { loadBatch } from "@/services/batchService";

export async function POST(request: Request) {
  try {
    const { batchId } = await request.json();
    const batch = await loadBatch(String(batchId));
    const result = await createVideoFactoryAdapter().uploadPublicImages(batch);
    const updated = await loadBatch(batch.id);
    return NextResponse.json({ ok: result.ok, batch: updated, result });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unknown error" }, { status: 400 });
  }
}
