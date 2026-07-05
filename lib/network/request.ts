export const DEFAULT_CLIENT_REQUEST_TIMEOUT_MS = 45_000;
export const LONG_CLIENT_REQUEST_TIMEOUT_MS = 10 * 60_000;
export const PROVIDER_REQUEST_TIMEOUT_MS = 30_000;
export const WATERMARK_REQUEST_TIMEOUT_MS = 45_000;

type TimeoutResult = {
  init: RequestInit;
  cancel: () => void;
};

export function withTimeoutSignal(init: RequestInit = {}, timeoutMs: number): TimeoutResult {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return { init, cancel: () => undefined };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort(timeoutReason(timeoutMs));
  }, timeoutMs);

  if (init.signal) {
    if (init.signal.aborted) {
      controller.abort(init.signal.reason);
    } else {
      init.signal.addEventListener("abort", () => controller.abort(init.signal?.reason), { once: true });
    }
  }

  return {
    init: { ...init, signal: controller.signal },
    cancel: () => clearTimeout(timeout)
  };
}

export function isAbortLikeError(error: unknown): boolean {
  if (typeof DOMException !== "undefined" && error instanceof DOMException) {
    return error.name === "AbortError" || error.name === "TimeoutError";
  }
  if (!(error instanceof Error)) return false;
  return /abort|aborted|timeout|timed out/i.test(error.name) || /abort|aborted|timeout|timed out/i.test(error.message);
}

export function formatNetworkError(error: unknown, context: string, timeoutMs?: number): string {
  if (isAbortLikeError(error)) {
    return `${context} timed out${timeoutMs ? ` after ${formatDuration(timeoutMs)}` : ""}. Check the network connection or remote service, then retry.`;
  }
  if (error instanceof TypeError) {
    return `${context} could not reach the server. Check that the service is running and the network is available.`;
  }
  return error instanceof Error ? error.message : `${context} failed.`;
}

export async function requestJson<T>(
  url: string,
  init: RequestInit = {},
  options: {
    timeoutMs?: number;
    retries?: number;
    retryDelayMs?: number;
  } = {}
): Promise<T> {
  const method = String(init.method || "GET").toUpperCase();
  const timeoutMs = options.timeoutMs ?? DEFAULT_CLIENT_REQUEST_TIMEOUT_MS;
  const retries = options.retries ?? (method === "GET" ? 1 : 0);
  const retryDelayMs = options.retryDelayMs ?? 600;
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const timed = withTimeoutSignal(init, timeoutMs);
    try {
      const response = await fetch(url, timed.init);
      if (attempt < retries && shouldRetryResponse(response)) {
        await sleep(retryDelayMs * (attempt + 1));
        continue;
      }
      return await parseJsonResponse<T>(response, url);
    } catch (error) {
      lastError = error;
      if (attempt < retries && isRetryableNetworkError(error)) {
        await sleep(retryDelayMs * (attempt + 1));
        continue;
      }
      throw new Error(formatNetworkError(error, `Request to ${url}`, timeoutMs));
    } finally {
      timed.cancel();
    }
  }

  throw new Error(formatNetworkError(lastError, `Request to ${url}`, timeoutMs));
}

async function parseJsonResponse<T>(response: Response, url: string): Promise<T> {
  const text = await response.text();
  if (!text.trim()) return {} as T;

  try {
    return JSON.parse(text) as T;
  } catch {
    const status = `${response.status} ${response.statusText}`.trim();
    throw new Error(`Request to ${url} returned HTTP ${status} with a non-JSON response.`);
  }
}

function shouldRetryResponse(response: Response): boolean {
  return response.status === 408 || response.status === 429 || response.status === 502 || response.status === 503 || response.status === 504;
}

function isRetryableNetworkError(error: unknown): boolean {
  return isAbortLikeError(error) || error instanceof TypeError;
}

function timeoutReason(timeoutMs: number): Error | DOMException {
  const message = `Request timed out after ${formatDuration(timeoutMs)}.`;
  return typeof DOMException === "undefined" ? new Error(message) : new DOMException(message, "TimeoutError");
}

function formatDuration(ms: number): string {
  if (ms >= 60_000 && ms % 60_000 === 0) return `${ms / 60_000}m`;
  if (ms >= 1_000 && ms % 1_000 === 0) return `${ms / 1_000}s`;
  return `${ms}ms`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
