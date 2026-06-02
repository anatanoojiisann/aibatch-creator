import { createHash } from "node:crypto";
import { redactHarSecrets } from "@/lib/providers/shared/webHar/redactHarSecrets";
import type { ProviderCapability, ProviderEndpointManifestEntry } from "@/lib/providers/providerTypes";

export type WebProviderId = "pixverse_web" | "pai_web";
export type WebOperationGuess =
  | "login/session"
  | "upload_image"
  | "upload_video"
  | "text_to_video"
  | "image_to_video"
  | "task_status"
  | "download_result"
  | "credit_balance"
  | "user_profile"
  | "template"
  | "unknown";

export type ObservedWebEndpoint = ProviderEndpointManifestEntry & {
  providerId: WebProviderId;
  providerSource: "web";
  stability: "experimental_web";
  host: string;
  queryShape: string;
  requestContentType: string;
  responseContentType: string;
  statusCodesObserved: number[];
  operationGuess: WebOperationGuess;
  lastObservedAt: string;
  sampleCount: number;
  sanitizedRequestShape: string;
  sanitizedResponseShape: string;
  sourceHarFingerprint: string;
};

export function parseObservedWebEndpoints(providerId: WebProviderId, har: unknown, sourceFileName = "manual.har") {
  const importedAt = new Date().toISOString();
  const sourceHarFingerprint = createHash("sha256").update(`${sourceFileName}\n${JSON.stringify(har)}`).digest("hex").slice(0, 12);
  const entries = getEntries(har);
  const grouped = new Map<string, ObservedWebEndpoint>();

  for (const entry of entries) {
    const sanitizedEntry = redactHarSecrets(entry);
    const request = sanitizedEntry.request || {};
    const response = sanitizedEntry.response || {};
    const method = normalizeMethod(request.method);
    const url = parseUrl(request.url);
    if (!url || !method) continue;
    const operationGuess = guessOperation(url.pathname);
    const key = `${method} ${url.host}${url.pathname}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.sampleCount += 1;
      existing.lastObservedAt = importedAt;
      const status = Number(response.status);
      if (Number.isFinite(status) && !existing.statusCodesObserved.includes(status)) existing.statusCodesObserved.push(status);
      continue;
    }
    const status = Number(response.status);
    grouped.set(key, {
      id: `${providerId}_${operationGuess.replace(/[^a-z0-9]+/g, "_")}_${createHash("sha256").update(key).digest("hex").slice(0, 10)}`,
      providerId,
      providerGroup: providerId === "pixverse_web" ? "pixverse" : "pai",
      providerSource: "web",
      method,
      path: url.pathname,
      baseUrlEnvKey: providerId === "pixverse_web" ? "PIXVERSE_WEB_BASE_URL" : "PAI_WEB_BASE_URL",
      docsUrl: `manual-har:${sourceHarFingerprint}`,
      authRequired: true,
      capability: capabilityFor(operationGuess),
      requestSchema: "Sanitized HAR-derived request shape. Verify manually before implementation.",
      responseSchema: "Sanitized HAR-derived response shape. Verify manually before implementation.",
      implemented: false,
      stability: "experimental_web",
      notes: "Observed from a user-provided HAR file. Automatic web actions remain disabled.",
      host: url.host,
      queryShape: queryShape(url),
      requestContentType: contentType(request.headers, request.postData?.mimeType),
      responseContentType: contentType(response.headers, response.content?.mimeType),
      statusCodesObserved: Number.isFinite(status) ? [status] : [],
      operationGuess,
      lastObservedAt: importedAt,
      sampleCount: 1,
      sanitizedRequestShape: JSON.stringify(shapeOf({
        query: Object.fromEntries(url.searchParams),
        headers: request.headers,
        postData: request.postData
      })),
      sanitizedResponseShape: JSON.stringify(shapeOf({
        headers: response.headers,
        content: response.content
      })),
      sourceHarFingerprint
    });
  }

  return {
    providerId,
    sourceHarFingerprint,
    importedAt,
    rawHarStored: false as const,
    secretRedactionStatus: "applied" as const,
    observedRequestCount: entries.length,
    observedEndpointCount: grouped.size,
    endpoints: [...grouped.values()]
  };
}

function getEntries(har: unknown): Array<{ request?: any; response?: any }> {
  const entries = (har as { log?: { entries?: unknown[] } })?.log?.entries;
  return Array.isArray(entries) ? entries.filter((entry): entry is { request?: any; response?: any } => Boolean(entry && typeof entry === "object")) : [];
}

function normalizeMethod(value: unknown): ObservedWebEndpoint["method"] | undefined {
  const method = String(value || "").toUpperCase();
  return ["GET", "POST", "PUT", "PATCH", "DELETE"].includes(method) ? method as ObservedWebEndpoint["method"] : undefined;
}

function parseUrl(value: unknown): URL | undefined {
  try {
    return new URL(String(value || ""));
  } catch {
    return undefined;
  }
}

function queryShape(url: URL): string {
  return [...new Set([...url.searchParams.keys()])].sort().join(", ");
}

function contentType(headers: unknown, fallback: unknown): string {
  if (typeof fallback === "string" && fallback) return fallback;
  if (!Array.isArray(headers)) return "";
  const header = headers.find((entry) => String(entry?.name || "").toLowerCase() === "content-type");
  return String(header?.value || "");
}

function guessOperation(path: string): WebOperationGuess {
  const normalized = path.toLowerCase();
  if (/(login|logout|session|signin|signup|verify|captcha)/.test(normalized)) return "login/session";
  if (/(credit|balance|quota)/.test(normalized)) return "credit_balance";
  if (/(profile|account|user)/.test(normalized)) return "user_profile";
  if (/(download|result)/.test(normalized) && /(video|task|job|generation)/.test(normalized)) return "download_result";
  if (/(status|progress|task|job)/.test(normalized)) return "task_status";
  if (/(template|effect|style)/.test(normalized)) return "template";
  if (/(upload)/.test(normalized) && /(image|img|photo)/.test(normalized)) return "upload_image";
  if (/(upload)/.test(normalized) && /(video|media|audio)/.test(normalized)) return "upload_video";
  if (/(image.to.video|img.to.video|image2video|i2v)/.test(normalized)) return "image_to_video";
  if (/(text.to.video|text2video|t2v)/.test(normalized)) return "text_to_video";
  return "unknown";
}

function capabilityFor(operation: WebOperationGuess): ProviderCapability {
  if (operation === "credit_balance") return "credit_balance";
  if (operation === "upload_image") return "upload_image";
  if (operation === "upload_video") return "media_upload";
  if (operation === "image_to_video") return "image_to_video";
  if (operation === "text_to_video") return "text_to_video";
  if (operation === "task_status" || operation === "download_result") return "video_status";
  if (operation === "template") return "template_video";
  return "unknown";
}

function shapeOf(value: unknown): unknown {
  if (value === "[REDACTED]") return value;
  if (Array.isArray(value)) return value.length > 0 ? [shapeOf(value[0])] : [];
  if (!value || typeof value !== "object") return typeof value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, child]) => [key, shapeOf(child)]));
}
