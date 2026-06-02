import { NextResponse } from "next/server";
import { saveProviderSettings } from "@/lib/providers/providerSettings";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    return NextResponse.json(saveProviderSettings(String(body.providerId || ""), body.envUpdates));
  } catch (error) {
    return NextResponse.json({
      ok: false,
      errorCode: "PROVIDER_SETTINGS_SAVE_FAILED",
      message: error instanceof Error ? error.message : "Unable to save provider settings."
    }, { status: 400 });
  }
}
