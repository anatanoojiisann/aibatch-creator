import { NextResponse } from "next/server";
import { isProviderId } from "@/lib/providers/providerRegistry";
import { loadBatch, saveBatch } from "@/lib/services/batchService";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!isProviderId(body.providerId)) {
      return NextResponse.json({ ok: false, errorCode: "INVALID_PROVIDER", message: "Select a supported provider." }, { status: 400 });
    }
    const batch = await loadBatch(String(body.batchId));
    const updated = await saveBatch({ ...batch, providerSetup: { selectedProviderId: body.providerId } });
    return NextResponse.json({ ok: true, batch: updated });
  } catch (error) {
    return NextResponse.json({ ok: false, errorCode: "UPDATE_PROVIDER_FAILED", message: error instanceof Error ? error.message : "Unknown error" }, { status: 400 });
  }
}
