import { NextResponse } from "next/server";
import { createVideoBatch, listBatches } from "@/services/batchService";

export async function GET() {
  return NextResponse.json({ batches: await listBatches() });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const batch = await createVideoBatch({
      topic: String(body.topic || body.sourceTopic || "Untitled video batch"),
      platform: body.platform,
      aspectRatio: body.aspectRatio,
      persona: body.persona,
      count: Number(body.count || 10),
      styleNotes: body.styleNotes,
      title: body.title,
    });
    return NextResponse.json({ ok: true, batch });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unknown error" }, { status: 400 });
  }
}
