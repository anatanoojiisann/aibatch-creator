import { NextResponse } from "next/server";
import { getProviderDiagnostics } from "@/lib/providers/providerDiagnostics";

export async function GET() {
  return NextResponse.json({ ok: true, providers: getProviderDiagnostics() });
}
