import { NextResponse } from "next/server";
import { getProviderSettingsDiagnostics } from "@/lib/providers/providerSettings";

export async function GET() {
  return NextResponse.json({ ok: true, providers: getProviderSettingsDiagnostics() });
}
