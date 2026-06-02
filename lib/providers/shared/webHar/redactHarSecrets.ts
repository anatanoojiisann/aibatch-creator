const sensitiveHeaderNames = new Set([
  "authorization",
  "cookie",
  "set-cookie",
  "x-api-key",
  "api-key",
  "token",
  "x-token"
]);

const sensitiveFieldNames = new Set([
  "access_token",
  "refresh_token",
  "token",
  "cookie",
  "cookies",
  "authorization",
  "session",
  "sessionid",
  "session_id"
]);

export function redactHarSecrets<T>(value: T): T {
  return redact(value, "") as T;
}

function redact(value: unknown, key: string): unknown {
  if (sensitiveFieldNames.has(key.toLowerCase())) return "***";
  if (Array.isArray(value)) return value.map((entry) => redact(entry, ""));
  if (!value || typeof value !== "object") return value;
  const record = value as Record<string, unknown>;
  if (typeof record.name === "string" && sensitiveHeaderNames.has(record.name.toLowerCase()) && "value" in record) {
    return { ...record, value: "***" };
  }
  return Object.fromEntries(Object.entries(record).map(([childKey, child]) => [childKey, redact(child, childKey)]));
}
