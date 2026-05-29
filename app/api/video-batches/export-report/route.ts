import { NextResponse } from "next/server";
import { exportFinalReport } from "@/lib/services/batchService";

export async function POST(request: Request) {
  try {
    const { batchId } = await request.json();
    const result = await exportFinalReport(String(batchId));
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unknown error" }, { status: 400 });
  }
}
