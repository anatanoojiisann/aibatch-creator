import { NextResponse } from "next/server";
import { createVideoFactoryAdapter } from "@/lib/integrations/videofactory/videoFactoryAdapter";
import { loadBatch } from "@/lib/services/batchService";

export async function POST(request: Request) {
  try {
    const { batchId } = await request.json();
    const batch = await loadBatch(String(batchId));
    const result = await createVideoFactoryAdapter().createPromptDir(batch);
    return NextResponse.json({ ok: true, batch: await loadBatch(batch.id), ...result });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unknown error" }, { status: 400 });
  }
}
