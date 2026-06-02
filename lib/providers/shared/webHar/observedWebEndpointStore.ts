import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { replacePaiWebObservedEndpointManifest } from "@/lib/providers/paiWeb/paiWebObservedEndpointManifest";
import { replacePixVerseWebObservedEndpointManifest } from "@/lib/providers/pixverseWeb/pixverseWebObservedEndpointManifest";
import type { ObservedWebEndpoint, WebProviderId } from "@/lib/providers/shared/webHar/parseObservedWebEndpoints";

export async function saveObservedWebEndpointReport(report: {
  providerId: WebProviderId;
  sourceHarFingerprint: string;
  importedAt: string;
  rawHarStored: false;
  secretRedactionStatus: "applied";
  observedRequestCount: number;
  observedEndpointCount: number;
  endpoints: ObservedWebEndpoint[];
}) {
  const dir = path.join(process.cwd(), "storage", "web-api-capture");
  await mkdir(dir, { recursive: true });
  const reportPath = path.join(dir, `${report.providerId}-observed-endpoints.json`);
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  replaceObservedWebEndpointManifest(report.providerId, report.endpoints);
  return reportPath;
}

export function replaceObservedWebEndpointManifest(providerId: WebProviderId, endpoints: ObservedWebEndpoint[]) {
  if (providerId === "pixverse_web") {
    replacePixVerseWebObservedEndpointManifest(endpoints);
    return;
  }
  replacePaiWebObservedEndpointManifest(endpoints);
}
