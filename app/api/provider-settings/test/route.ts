import { NextResponse } from "next/server";
import { testProviderSettingsConnection } from "@/lib/providers/providerSettings";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const result = await testProviderSettingsConnection(String(body.providerId || ""));
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      errorCode: "PROVIDER_SETTINGS_TEST_FAILED",
      message: error instanceof Error ? error.message : "Unable to test provider settings."
    }, { status: 400 });
  }
}
