import { NextResponse } from "next/server";
import { createVideoFactoryAdapter } from "@/integrations/videofactory/videoFactoryAdapter";
import { loadBatch, saveBatch } from "@/services/batchService";

export async function POST(request: Request) {
  try {
    const { batchId } = await request.json();
    const batch = await loadBatch(String(batchId));
    const adapter = createVideoFactoryAdapter();
    const result = await adapter.createPromptDir(batch);
    const updated = await loadBatch(batch.id);
    return NextResponse.json({ ok: true, batch: await saveBatch(updated), ...result });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unknown error" }, { status: 400 });
  }
}
