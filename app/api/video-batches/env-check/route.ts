import { existsSync } from "node:fs";
import { NextResponse } from "next/server";
import { getVideoFactoryRuntimeDiagnostics } from "@/lib/integrations/videofactory/videoFactoryAdapter";

export async function GET() {
  const diagnostics = getVideoFactoryRuntimeDiagnostics();
  return NextResponse.json({
    videoFactoryPathExists: existsSync(diagnostics.videoFactoryPath),
    envLocalExists: diagnostics.envLocalExists,
    pixverseKeyPresent: diagnostics.keyPresent,
    pixverseKeyLength: diagnostics.keyLength,
    pixverseKeySha256Prefix: diagnostics.keySha256Prefix,
    pixverseKeyMasked: diagnostics.keyMasked,
    bridgeUrl: diagnostics.bridgeUrl
  });
}
