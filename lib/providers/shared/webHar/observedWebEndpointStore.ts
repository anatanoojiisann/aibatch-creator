import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { replacePaiWebObservedEndpointManifest } from "@/lib/providers/paiWeb/paiWebObservedEndpointManifest";
import { replacePixVerseWebObservedEndpointManifest } from "@/lib/providers/pixverseWeb/pixverseWebObservedEndpointManifest";
import type { ObservedWebEndpoint, WebGenerationFlowCoverage, WebProviderId } from "@/lib/providers/shared/webHar/parseObservedWebEndpoints";

export async function saveObservedWebEndpointReport(report: {
  providerId: WebProviderId;
  sourceHarFingerprint: string;
  importedAt: string;
  rawHarStored: false;
  secretRedactionStatus: "applied";
  observedRequestCount: number;
  observedEndpointCount: number;
  endpoints: ObservedWebEndpoint[];
  coverage: WebGenerationFlowCoverage;
}) {
  const dir = path.join(process.cwd(), "storage", "web-api-capture");
  await mkdir(dir, { recursive: true });
  const reportPath = path.join(dir, `${report.providerId}-observed-endpoints.json`);
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await writeObservedWebEndpointManifestModule(report.providerId, report.endpoints);
  await updateCoverageReport(report);
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

async function writeObservedWebEndpointManifestModule(providerId: WebProviderId, endpoints: ObservedWebEndpoint[]) {
  const providerDir = providerId === "pixverse_web" ? "pixverseWeb" : "paiWeb";
  const exportName = providerId === "pixverse_web"
    ? "pixverseWebObservedEndpointManifest"
    : "paiWebObservedEndpointManifest";
  const replaceName = providerId === "pixverse_web"
    ? "replacePixVerseWebObservedEndpointManifest"
    : "replacePaiWebObservedEndpointManifest";
  const manifestPath = path.join(process.cwd(), "lib", "providers", providerDir, `${providerDir}ObservedEndpointManifest.ts`);
  const source = [
    'import { ProviderEndpointManifestEntry } from "@/lib/providers/providerTypes";',
    "",
    `export const ${exportName}: ProviderEndpointManifestEntry[] = ${JSON.stringify(endpoints, null, 2)};`,
    "",
    `export function ${replaceName}(endpoints: ProviderEndpointManifestEntry[]) {`,
    `  ${exportName}.splice(0, ${exportName}.length, ...endpoints);`,
    "}",
    ""
  ].join("\n");
  await writeFile(manifestPath, source, "utf8");
}

async function updateCoverageReport(report: {
  providerId: WebProviderId;
  sourceHarFingerprint: string;
  importedAt: string;
  observedEndpointCount: number;
  endpoints: ObservedWebEndpoint[];
  coverage: WebGenerationFlowCoverage;
}) {
  const reportPath = path.join(process.cwd(), "storage", "provider-endpoint-coverage-report.md");
  const current = await readFile(reportPath, "utf8");
  const marker = report.providerId === "pixverse_web" ? "PIXVERSE_WEB_OBSERVED" : "PAI_WEB_OBSERVED";
  const operationGuesses = [...new Set(report.endpoints.map((endpoint) => endpoint.operationGuess))].sort();
  const endpointIds = report.endpoints.map((endpoint) => endpoint.id);
  const rows = report.endpoints.length
    ? report.endpoints.map((endpoint) =>
      `| \`${endpoint.id}\` | \`${endpoint.operationGuess}\` | \`${endpoint.method}\` | \`${endpoint.host}${endpoint.path}\` | \`${endpoint.sampleCount}\` | \`${endpoint.statusCodesObserved.join(", ")}\` | \`false\` | \`experimental_web\` |`
    )
    : ["| `none_observed_yet` | `none` | `none` | `HAR capture pending` | `0` | `none` | `false` | `experimental_web` |"];
  const block = [
    `<!-- ${marker}:START -->`,
    `Total observed endpoint count: \`${report.observedEndpointCount}\`.`,
    `Last sanitized HAR import: \`${report.importedAt}\`. Source HAR fingerprint: \`${report.sourceHarFingerprint}\`.`,
    "Raw HAR persisted: `no`. Secret redaction status: `applied`. Observed endpoints default to `implemented=false`.",
    `Endpoint IDs: ${endpointIds.length ? endpointIds.map((id) => `\`${id}\``).join(", ") : "`none_observed_yet`"}.`,
    `Operation guesses: ${operationGuesses.length ? operationGuesses.map((guess) => `\`${guess}\``).join(", ") : "`none`"}.`,
    `Complete generation flow: \`${report.coverage.completeGenerationFlow}\`.`,
    `Missing operations: ${report.coverage.missingOperations.length ? report.coverage.missingOperations.map((operation) => `\`${operation}\``).join(", ") : "`none`"}.`,
    "",
    "| Endpoint ID | Operation guess | Method | Host and path | Samples | Status codes | Implemented | Stability |",
    "| --- | --- | --- | --- | ---: | --- | --- | --- |",
    ...rows,
    `<!-- ${marker}:END -->`
  ].join("\n");
  const pattern = new RegExp(`<!-- ${marker}:START -->[\\s\\S]*?<!-- ${marker}:END -->`);
  if (!pattern.test(current)) return;
  const providerLabel = report.providerId === "pixverse_web" ? "PixVerse Web" : "Pai Web";
  const summaryPattern = new RegExp(`\\| ${providerLabel} \\| 0 \\| [^\\n]+`);
  const summaryRow = `| ${providerLabel} | 0 | ${report.observedEndpointCount} observed endpoints | ${report.observedEndpointCount} recorded; sanitized HAR import |`;
  await writeFile(reportPath, current.replace(pattern, block).replace(summaryPattern, summaryRow), "utf8");
}
