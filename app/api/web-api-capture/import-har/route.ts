import { NextResponse } from "next/server";
import { parseObservedWebEndpoints, WebProviderId } from "@/lib/providers/shared/webHar/parseObservedWebEndpoints";
import { saveObservedWebEndpointReport } from "@/lib/providers/shared/webHar/observedWebEndpointStore";

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const providerId = String(form.get("providerId") || "");
    if (!isWebProviderId(providerId)) {
      return NextResponse.json({ ok: false, errorCode: "INVALID_WEB_PROVIDER", message: "Choose pixverse_web or pai_web." }, { status: 400 });
    }
    const file = form.get("harFile");
    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, errorCode: "HAR_FILE_REQUIRED", message: "Select a HAR file to import." }, { status: 400 });
    }
    const har = JSON.parse(await file.text()) as unknown;
    const report = parseObservedWebEndpoints(providerId, har, file.name);
    const previewOnly = form.get("previewOnly") === "true";
    const reportPath = previewOnly ? undefined : await saveObservedWebEndpointReport(report);
    return NextResponse.json({
      ok: true,
      providerId,
      rawHarStored: false,
      secretRedactionStatus: report.secretRedactionStatus,
      sourceHarFingerprint: report.sourceHarFingerprint,
      importedAt: report.importedAt,
      observedRequestCount: report.observedRequestCount,
      observedEndpointCount: report.observedEndpointCount,
      endpoints: report.endpoints,
      coverage: report.coverage,
      reportPath,
      previewOnly,
      message: previewOnly
        ? "HAR preview parsed and sanitized. Raw HAR was discarded and no manifest was saved."
        : "HAR parsed and sanitized. Raw HAR was discarded; the provider-specific observed manifest report was saved."
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      errorCode: "HAR_IMPORT_FAILED",
      message: error instanceof SyntaxError ? "The selected file is not valid HAR JSON." : "Unable to import HAR safely."
    }, { status: 400 });
  }
}

function isWebProviderId(value: string): value is WebProviderId {
  return value === "pixverse_web" || value === "pai_web";
}
