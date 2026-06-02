import { createHash } from "node:crypto";
import { redactHarSecrets } from "@/lib/providers/shared/webHar/redactHarSecrets";
import type { ProviderCapability, ProviderEndpointManifestEntry } from "@/lib/providers/providerTypes";

export type WebProviderId = "pixverse_web" | "pai_web";
export type WebOperationGuess =
  | "login/session"
  | "upload_image"
  | "upload_media"
  | "text_to_video"
  | "image_to_video"
  | "task_list"
  | "task_status"
  | "download_result"
  | "credit_balance"
  | "user_profile"
  | "asset_library"
  | "template"
  | "restyle"
  | "tts"
  | "pricing"
  | "config"
  | "unknown";

export type WebGenerationFlowCoverage = {
  completeGenerationFlow: boolean;
  operationGuesses: WebOperationGuess[];
  missingOperations: string[];
  missingGenerationFlowOperations: string[];
};

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
  source: "har";
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
    if (!isApiLikeRequest(url, method, request, response, operationGuess)) continue;
    const normalizedPath = normalizePath(url.pathname);
    const key = `${providerId} ${method} ${url.host}${normalizedPath}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.sampleCount += 1;
      existing.lastObservedAt = importedAt;
      const status = Number(response.status);
      if (Number.isFinite(status) && !existing.statusCodesObserved.includes(status)) existing.statusCodesObserved.push(status);
      existing.sanitizedRequestShape = mergeShapeStrings(existing.sanitizedRequestShape, requestShape(url, request));
      existing.sanitizedResponseShape = mergeShapeStrings(existing.sanitizedResponseShape, responseShape(response));
      continue;
    }
    const status = Number(response.status);
    grouped.set(key, {
      id: `${providerId}_${operationGuess.replace(/[^a-z0-9]+/g, "_")}_${createHash("sha256").update(key).digest("hex").slice(0, 10)}`,
      providerId,
      providerGroup: providerId === "pixverse_web" ? "pixverse" : "pai",
      providerSource: "web",
      method,
      path: normalizedPath,
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
      sanitizedRequestShape: requestShape(url, request),
      sanitizedResponseShape: responseShape(response),
      sourceHarFingerprint,
      source: "har"
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
    endpoints: [...grouped.values()],
    coverage: generationFlowCoverage([...grouped.values()])
  };
}

export function generationFlowCoverage(endpoints: Array<Pick<ObservedWebEndpoint, "operationGuess">>): WebGenerationFlowCoverage {
  const operationGuesses = [...new Set(endpoints.map((endpoint) => endpoint.operationGuess))].sort();
  const hasAny = (...values: WebOperationGuess[]) => values.some((value) => operationGuesses.includes(value));
  const broaderChecks: Array<[string, boolean]> = [
    ["account/user info", hasAny("user_profile")],
    ["credit balance", hasAny("credit_balance")],
    ["asset/library list", hasAny("asset_library")],
    ["upload image or upload media", hasAny("upload_image", "upload_media")],
    ["image-to-video or text-to-video generation creation", hasAny("image_to_video", "text_to_video")],
    ["task status or task detail polling", hasAny("task_status")],
    ["generated result or download result", hasAny("download_result")]
  ];
  const generationChecks = broaderChecks.slice(3);
  return {
    completeGenerationFlow: generationChecks.every(([, present]) => present),
    operationGuesses,
    missingOperations: broaderChecks.filter(([, present]) => !present).map(([label]) => label),
    missingGenerationFlowOperations: generationChecks.filter(([, present]) => !present).map(([label]) => label)
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

function normalizePath(pathname: string): string {
  return pathname
    .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, "{id}")
    .replace(/\/\d+(?=\/|$)/g, "/{id}")
    .replace(/\/[0-9a-f]{16,}(?=\/|$)/gi, "/{id}")
    .replace(/\/[A-Za-z0-9_-]{24,}(?=\/|$)/g, "/{id}");
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
  if (/(task|job).*(list|history)|(?:list|history).*(task|job)/.test(normalized)) return "task_list";
  if (/(status|progress|detail)/.test(normalized) && /(task|job|video|generation)/.test(normalized)) return "task_status";
  if (/(upload)/.test(normalized) && /(image|img|photo)/.test(normalized)) return "upload_image";
  if (/(upload)/.test(normalized) && /(video|media|audio)/.test(normalized)) return "upload_media";
  if (/(image.to.video|img.to.video|image2video|i2v|video\/img|img\/generate)/.test(normalized)) return "image_to_video";
  if (/(text.to.video|text2video|t2v|video\/text)/.test(normalized)) return "text_to_video";
  if (/(asset|library|media).*(list|page|query)|(?:list|page|query).*(asset|library|media)/.test(normalized)) return "asset_library";
  if (/(restyle)/.test(normalized)) return "restyle";
  if (/(tts|voice|speaker)/.test(normalized)) return "tts";
  if (/(pricing|price|plan)/.test(normalized)) return "pricing";
  if (/(config|setting)/.test(normalized)) return "config";
  if (/(template|effect|style)/.test(normalized)) return "template";
  return "unknown";
}

function isApiLikeRequest(
  url: URL,
  method: ObservedWebEndpoint["method"],
  request: Record<string, any>,
  response: Record<string, any>,
  operationGuess: WebOperationGuess
): boolean {
  const target = `${url.host}${url.pathname}`.toLowerCase();
  if (/\.(?:avif|bmp|css|eot|gif|ico|jpe?g|js|map|mp3|mp4|ogg|otf|png|svg|ttf|wav|webm|webp|woff2?)(?:$|\/)/.test(url.pathname.toLowerCase())) return false;
  if (/(analytics|doubleclick|googletagmanager|google-analytics|hotjar|segment|sentry|clarity|facebook\.com\/tr|mixpanel|amplitude|beacon|telemetry|metrics)/.test(target)) return false;
  if (/(\/_next\/|\/static\/|\/assets\/|\/favicon|\/manifest\.json$)/.test(url.pathname.toLowerCase())) return false;
  if (operationGuess !== "unknown") return true;
  const requestType = contentType(request.headers, request.postData?.mimeType).toLowerCase();
  const responseType = contentType(response.headers, response.content?.mimeType).toLowerCase();
  return method !== "GET"
    || /(\/api\/|\/openapi\/|\/graphql|\/rpc\/|\/ajax\/)/.test(url.pathname.toLowerCase())
    || /(json|graphql|x-www-form-urlencoded|multipart\/form-data)/.test(`${requestType} ${responseType}`);
}

function capabilityFor(operation: WebOperationGuess): ProviderCapability {
  if (operation === "credit_balance") return "credit_balance";
  if (operation === "upload_image") return "upload_image";
  if (operation === "upload_media") return "media_upload";
  if (operation === "image_to_video") return "image_to_video";
  if (operation === "text_to_video") return "text_to_video";
  if (operation === "task_status" || operation === "download_result") return "video_status";
  if (operation === "template") return "template_video";
  if (operation === "restyle") return "restyle_video";
  if (operation === "tts") return "lip_sync_tts_list";
  return "unknown";
}

function shapeOf(value: unknown): unknown {
  if (value === "[REDACTED]") return value;
  if (Array.isArray(value)) return value.length > 0 ? [shapeOf(value[0])] : [];
  if (!value || typeof value !== "object") return typeof value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, child]) => [key, shapeOf(child)]));
}

function requestShape(url: URL, request: Record<string, any>): string {
  return JSON.stringify(shapeOf({
    query: Object.fromEntries(url.searchParams),
    headers: request.headers,
    postData: {
      mimeType: request.postData?.mimeType,
      params: request.postData?.params,
      body: serializedShape(request.postData?.text)
    }
  }));
}

function responseShape(response: Record<string, any>): string {
  return JSON.stringify(shapeOf({
    headers: response.headers,
    content: {
      mimeType: response.content?.mimeType,
      body: serializedShape(response.content?.text)
    }
  }));
}

function serializedShape(text: unknown): unknown {
  if (typeof text !== "string" || !text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    try {
      return Object.fromEntries(new URLSearchParams(text));
    } catch {
      return "string";
    }
  }
}

function mergeShapeStrings(left: string, right: string): string {
  try {
    return JSON.stringify(mergeShapes(JSON.parse(left), JSON.parse(right)));
  } catch {
    return left;
  }
}

function mergeShapes(left: unknown, right: unknown): unknown {
  if (Array.isArray(left) && Array.isArray(right)) return left.length && right.length ? [mergeShapes(left[0], right[0])] : left.length ? left : right;
  if (left && right && typeof left === "object" && typeof right === "object") {
    const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
    return Object.fromEntries([...keys].sort().map((key) => [
      key,
      key in (left as Record<string, unknown>) && key in (right as Record<string, unknown>)
        ? mergeShapes((left as Record<string, unknown>)[key], (right as Record<string, unknown>)[key])
        : (left as Record<string, unknown>)[key] ?? (right as Record<string, unknown>)[key]
    ]));
  }
  return left === right ? left : [...new Set([String(left), String(right)])].sort().join("|");
}
