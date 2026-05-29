import { NextResponse } from "next/server";
import { generateMockVideoCreativeItems } from "@/lib/services/batchService";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const batch = await generateMockVideoCreativeItems({
      batchId: String(body.batchId),
      count: Number(body.count || 10),
      persona: body.persona,
      styleNotes: body.styleNotes
    });
    return NextResponse.json({ ok: true, batch });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unknown error" }, { status: 400 });
  }
}
