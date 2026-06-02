const sensitiveHeaderNames = new Set([
  "authorization",
  "cookie",
  "set-cookie",
  "x-api-key",
  "api-key",
  "api_key",
  "token",
  "x-token",
  "csrf",
  "xsrf"
]);

const sensitiveFieldNames = new Set([
  "access_token",
  "refresh_token",
  "id_token",
  "token",
  "cookie",
  "cookies",
  "authorization",
  "csrf",
  "xsrf",
  "session",
  "sessionid",
  "session_id",
  "jwt",
  "bearer",
  "auth",
  "secret",
  "key",
  "api_key",
  "user_id",
  "email",
  "phone"
]);

export function redactHarSecrets<T>(value: T): T {
  return redact(value, "") as T;
}

function redact(value: unknown, key: string): unknown {
  if (isSensitiveName(key)) return "[REDACTED]";
  if (Array.isArray(value)) return value.map((entry) => redact(entry, ""));
  if (typeof value === "string") {
    if (key.toLowerCase() === "url") return redactUrl(value);
    if (["text", "body"].includes(key.toLowerCase())) return redactSerializedBody(value);
    return value.replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]");
  }
  if (!value || typeof value !== "object") return value;
  const record = value as Record<string, unknown>;
  if (typeof record.name === "string" && isSensitiveName(record.name) && "value" in record) {
    return { ...record, value: "[REDACTED]" };
  }
  return Object.fromEntries(Object.entries(record).map(([childKey, child]) => [childKey, redact(child, childKey)]));
}

function isSensitiveName(value: string): boolean {
  const normalized = value.toLowerCase().replace(/-/g, "_");
  return sensitiveFieldNames.has(normalized) || sensitiveHeaderNames.has(value.toLowerCase());
}

function redactUrl(value: string): string {
  try {
    const url = new URL(value);
    for (const key of [...url.searchParams.keys()]) {
      if (isSensitiveName(key)) url.searchParams.set(key, "[REDACTED]");
    }
    return url.toString();
  } catch {
    return value;
  }
}

function redactSerializedBody(value: string): string {
  try {
    return JSON.stringify(redact(JSON.parse(value), ""));
  } catch {
    try {
      const params = new URLSearchParams(value);
      if ([...params.keys()].length === 0) return value.replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]");
      for (const key of [...params.keys()]) {
        if (isSensitiveName(key)) params.set(key, "[REDACTED]");
      }
      return params.toString();
    } catch {
      return value.replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]");
    }
  }
}
