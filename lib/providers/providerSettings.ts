import { createHash } from "node:crypto";
import { existsSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { normalizePixVerseOfficialError } from "@/lib/providers/pixverseOfficial/pixverseOfficialErrorNormalizer";
import { buildPixVerseBalanceRequest } from "@/lib/providers/pixverseOfficial/pixverseOfficialRequestBuilders";
import { parsePixVerseOfficialBalanceResponse } from "@/lib/providers/pixverseOfficial/pixverseOfficialResponseParsers";

export type ProviderSettingsId =
  | "pixverse_official_api"
  | "pixverse_web"
  | "pai_official_api"
  | "pai_web"
  | "custom_platform"
  | "legacy_video_factory_bridge";

type ProviderSettingsField = {
  envKey: string;
  label: string;
  sensitive: boolean;
  defaultValue?: string;
};

type ProviderSettingsDefinition = {
  id: ProviderSettingsId;
  label: string;
  description: string;
  fields: ProviderSettingsField[];
};

const definitions: ProviderSettingsDefinition[] = [
  {
    id: "pixverse_official_api",
    label: "PixVerse Official API",
    description: "PixVerse Platform API credentials only. These are never reused for Pai.",
    fields: [
      { envKey: "PIXVERSE_OFFICIAL_API_KEY", label: "API key", sensitive: true },
      { envKey: "PIXVERSE_OFFICIAL_BASE_URL", label: "Base URL", sensitive: false, defaultValue: "https://app-api.pixverse.ai" }
    ]
  },
  {
    id: "pixverse_web",
    label: "PixVerse Web",
    description: "Experimental manual-HAR settings only. Automatic browser actions are disabled.",
    fields: [
      { envKey: "PIXVERSE_WEB_MODE", label: "Mode", sensitive: false, defaultValue: "manual_har" },
      { envKey: "PIXVERSE_WEB_SESSION_PROFILE", label: "Local session profile name", sensitive: true },
      { envKey: "PIXVERSE_WEB_BASE_URL", label: "Base URL", sensitive: false }
    ]
  },
  {
    id: "pai_official_api",
    label: "Pai Official API",
    description: "Pai credentials only. Pai remains scaffolded until its official API contract is configured.",
    fields: [
      { envKey: "PAI_OFFICIAL_API_KEY", label: "API key", sensitive: true },
      { envKey: "PAI_OFFICIAL_BASE_URL", label: "Base URL", sensitive: false }
    ]
  },
  {
    id: "pai_web",
    label: "Pai Web",
    description: "Experimental manual-HAR settings only. Automatic browser actions are disabled.",
    fields: [
      { envKey: "PAI_WEB_MODE", label: "Mode", sensitive: false, defaultValue: "manual_har" },
      { envKey: "PAI_WEB_SESSION_PROFILE", label: "Local session profile name", sensitive: true },
      { envKey: "PAI_WEB_BASE_URL", label: "Base URL", sensitive: false, defaultValue: "https://pai.video" }
    ]
  },
  {
    id: "custom_platform",
    label: "Custom Platform",
    description: "Local custom-platform configuration. No generation capability is enabled by default.",
    fields: [
      { envKey: "CUSTOM_PLATFORM_API_KEY", label: "API key", sensitive: true },
      { envKey: "CUSTOM_PLATFORM_BASE_URL", label: "Base URL", sensitive: false }
    ]
  },
  {
    id: "legacy_video_factory_bridge",
    label: "Legacy VideoFactory Bridge only",
    description: "Optional legacy bridge settings. They are not official PixVerse or Pai credentials.",
    fields: [
      { envKey: "VIDEO_FACTORY_PATH", label: "VideoFactory path", sensitive: false },
      { envKey: "VIDEO_FACTORY_BRIDGE_URL", label: "Bridge URL", sensitive: false },
      { envKey: "PIXVERSE_WEB_PROVIDER_API_KEY", label: "Legacy bridge provider key", sensitive: true },
      { envKey: "BRIDGE_API_KEY", label: "Legacy bridge API key", sensitive: true },
      { envKey: "API_KEY", label: "Legacy bridge fallback key", sensitive: true }
    ]
  }
];

const allowedSettings = new Map(definitions.map((definition) => [definition.id, definition]));

export function providerSettingsPath(): string {
  return path.join(process.cwd(), ".env.local");
}

export function safeFingerprint(value: string) {
  return {
    present: Boolean(value),
    length: value.length,
    masked: value ? `${value.slice(0, 4)}...${value.slice(-4)}` : "",
    sha256Prefix: value ? createHash("sha256").update(value).digest("hex").slice(0, 12) : ""
  };
}

export function readLocalProviderEnv(filePath = providerSettingsPath()): Record<string, string> {
  if (!existsSync(filePath)) return {};
  return parseEnvText(readFileSync(filePath, "utf8"));
}

export function getConfiguredEnvValue(envKey: string, localEnv = readLocalProviderEnv()): string {
  const localValue = localEnv[envKey];
  if (localValue !== undefined) return localValue;
  if (process.env[envKey] !== undefined) return process.env[envKey] || "";
  return definitions.flatMap((definition) => definition.fields).find((field) => field.envKey === envKey)?.defaultValue || "";
}

export function getProviderSettingsDiagnostics(filePath = providerSettingsPath()) {
  const localEnv = readLocalProviderEnv(filePath);
  const updatedAt = existsSync(filePath) ? statSync(filePath).mtime.toISOString() : undefined;
  return definitions.map((definition) => ({
    id: definition.id,
    label: definition.label,
    description: definition.description,
    updatedAt,
    fields: definition.fields.map((field) => {
      const value = getConfiguredEnvValue(field.envKey, localEnv);
      return {
        envKey: field.envKey,
        label: field.label,
        sensitive: field.sensitive,
        configured: Boolean(value),
        value: field.sensitive ? undefined : value,
        fingerprint: field.sensitive ? safeFingerprint(value) : undefined
      };
    })
  }));
}

export function saveProviderSettings(
  providerId: string,
  envUpdates: unknown,
  filePath = providerSettingsPath()
) {
  if (!providerId) throw new Error("Provider ID is required.");
  const definition = allowedSettings.get(providerId as ProviderSettingsId);
  if (!definition) throw new Error("Provider settings ID is not supported.");
  if (!envUpdates || typeof envUpdates !== "object" || Array.isArray(envUpdates)) throw new Error("envUpdates must be an object.");
  const allowedKeys = new Set(definition.fields.map((field) => field.envKey));
  const updates = Object.fromEntries(Object.entries(envUpdates as Record<string, unknown>).map(([key, value]) => {
    if (!allowedKeys.has(key)) throw new Error(`Environment key is not allowed for ${providerId}: ${key}`);
    if (typeof value !== "string") throw new Error(`Environment value must be a string: ${key}`);
    return [key, value.trim()];
  }));
  const existing = existsSync(filePath) ? readFileSync(filePath, "utf8") : "";
  const next = updateEnvText(existing, updates);
  const temporaryPath = `${filePath}.tmp`;
  writeFileSync(temporaryPath, next, { encoding: "utf8", mode: 0o600 });
  renameSync(temporaryPath, filePath);
  return {
    ok: true as const,
    providerId,
    updatedAt: statSync(filePath).mtime.toISOString(),
    settings: getProviderSettingsDiagnostics(filePath).find((entry) => entry.id === providerId),
    message: "Credentials saved. Restart npm run dev for server runtime env changes to apply."
  };
}

export async function testProviderSettingsConnection(providerId: string, fetcher: typeof fetch = fetch) {
  const localEnv = readLocalProviderEnv();
  if (providerId === "pixverse_official_api") {
    const apiKey = getConfiguredEnvValue("PIXVERSE_OFFICIAL_API_KEY", localEnv);
    const baseUrl = getConfiguredEnvValue("PIXVERSE_OFFICIAL_BASE_URL", localEnv);
    const keyFingerprint = safeFingerprint(apiKey);
    if (!apiKey) return configMissing(providerId, keyFingerprint, baseUrl, "PIXVERSE_OFFICIAL_API_KEY is missing.");
    try {
      const request = buildPixVerseBalanceRequest(apiKey, baseUrl);
      const response = await fetcher(request.url, request.init);
      const data = await response.json().catch(() => ({}));
      const normalized = normalizePixVerseOfficialError(data);
      if (!response.ok || normalized) throw new Error(normalized?.message || `PixVerse Official API returned HTTP ${response.status}`);
      return {
        ok: true as const,
        providerId,
        keyFingerprint,
        baseUrl,
        capabilityTested: "credit_balance",
        status: "connection_ok",
        balance: parsePixVerseOfficialBalanceResponse(data)
      };
    } catch (error) {
      return {
        ok: false as const,
        providerId,
        keyFingerprint,
        baseUrl,
        capabilityTested: "credit_balance",
        status: "connection_failed",
        sanitizedError: sanitizeError(error)
      };
    }
  }
  if (providerId === "pai_official_api") {
    const apiKey = getConfiguredEnvValue("PAI_OFFICIAL_API_KEY", localEnv);
    return {
      ok: false as const,
      providerId,
      keyFingerprint: safeFingerprint(apiKey),
      baseUrl: getConfiguredEnvValue("PAI_OFFICIAL_BASE_URL", localEnv),
      capabilityTested: "none",
      status: "unsupported_scaffold",
      sanitizedError: "Pai Official API connection testing is not available until its endpoint contract is configured."
    };
  }
  if (providerId === "custom_platform") {
    const apiKey = getConfiguredEnvValue("CUSTOM_PLATFORM_API_KEY", localEnv);
    const baseUrl = getConfiguredEnvValue("CUSTOM_PLATFORM_BASE_URL", localEnv);
    return baseUrl
      ? {
        ok: false as const,
        providerId,
        keyFingerprint: safeFingerprint(apiKey),
        baseUrl,
        capabilityTested: "none",
        status: "unsupported_scaffold",
        sanitizedError: "Custom Platform has no configured connection-test endpoint."
      }
      : configMissing(providerId, safeFingerprint(apiKey), baseUrl, "CUSTOM_PLATFORM_BASE_URL is missing.");
  }
  return {
    ok: false as const,
    providerId,
    capabilityTested: "none",
    status: "manual_har_only",
    sanitizedError: "Automatic web connection tests are disabled. Use manual HAR import."
  };
}

export function updateEnvText(existing: string, updates: Record<string, string>): string {
  const pending = new Map(Object.entries(updates));
  const lines = existing ? existing.replace(/\r\n/g, "\n").split("\n") : [];
  const nextLines = lines.map((line) => {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=/);
    if (!match || !pending.has(match[1])) return line;
    const value = pending.get(match[1]) as string;
    pending.delete(match[1]);
    return `${match[1]}=${value}`;
  });
  if (nextLines.length > 0 && nextLines[nextLines.length - 1] !== "") nextLines.push("");
  for (const [key, value] of pending) nextLines.push(`${key}=${value}`);
  return `${nextLines.join("\n").replace(/\n+$/, "")}\n`;
}

function parseEnvText(text: string): Record<string, string> {
  return Object.fromEntries(text.split(/\r?\n/).flatMap((line) => {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) return [];
    return [[match[1], match[2].trim().replace(/^(['"])(.*)\1$/, "$2")]];
  }));
}

function configMissing(providerId: string, keyFingerprint: ReturnType<typeof safeFingerprint>, baseUrl: string, sanitizedError: string) {
  return {
    ok: false as const,
    providerId,
    keyFingerprint,
    baseUrl,
    capabilityTested: "none",
    status: "config_missing",
    sanitizedError
  };
}

function sanitizeError(error: unknown): string {
  const message = error instanceof Error ? error.message : "Provider connection test failed.";
  return message.replace(/(api[-_ ]?key|authorization|cookie|token|secret)\s*[:=]\s*\S+/gi, "$1=[REDACTED]");
}
