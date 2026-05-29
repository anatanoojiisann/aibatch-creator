import { NextResponse } from "next/server";
import { createVideoBatch, listBatches } from "@/lib/services/batchService";

export async function GET() {
  return NextResponse.json({ ok: true, batches: await listBatches() });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const batch = await createVideoBatch({
      title: body.title,
      sourceTopic: String(body.sourceTopic || body.topic || "Untitled video batch"),
      platform: body.platform,
      aspectRatio: body.aspectRatio
    });
    return NextResponse.json({ ok: true, batch });
  } catch (error) {
    return NextResponse.json({ ok: false, error: errorMessage(error) }, { status: 400 });
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}
