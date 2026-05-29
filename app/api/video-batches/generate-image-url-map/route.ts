import { NextResponse } from "next/server";
import { loadBatch } from "@/lib/services/batchService";
import { generateImageUrlMap } from "@/lib/services/publicAssetService";

export async function POST(request: Request) {
  try {
    const { batchId } = await request.json();
    const result = await generateImageUrlMap(await loadBatch(String(batchId)));
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unknown error" }, { status: 400 });
  }
}
