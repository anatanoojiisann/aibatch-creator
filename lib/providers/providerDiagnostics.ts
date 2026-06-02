import { createHash } from "node:crypto";
import { getProviderRegistry } from "@/lib/providers/providerRegistry";

export type ProviderDiagnostic = ReturnType<typeof getProviderDiagnostics>[number];

export function getProviderDiagnostics() {
  return getProviderRegistry().map((provider) => {
    const credentials = provider.credentialEnvKeys.map((envKey) => ({
      envKey,
      ...safeFingerprint(process.env[envKey] || "")
    }));
    const baseUrl = provider.baseUrlEnvKey ? process.env[provider.baseUrlEnvKey] || "" : "";
    return {
      id: provider.id,
      group: provider.group,
      source: provider.source,
      label: provider.label,
      accountScope: provider.accountScope,
      balanceScope: provider.balanceScope,
      stable: provider.stable,
      experimental: provider.experimental || false,
      sessionMode: provider.sessionMode,
      sessionProfileEnvKey: provider.sessionProfileEnvKey,
      baseUrlEnvKey: provider.baseUrlEnvKey,
      baseUrlConfigured: Boolean(baseUrl),
      credentials,
      credentialStatus: provider.source === "web"
        ? "manual_har_session_required"
        : credentials.length > 0 && credentials.every((credential) => credential.present) ? "configured" : "missing",
      balanceStatus: provider.capabilities.includes("credit_balance") ? "supported_not_checked" : "unsupported",
      capabilities: provider.capabilities,
      endpointManifest: provider.endpointManifest,
      limitations: provider.limitations
    };
  });
}

function safeFingerprint(value: string) {
  return {
    present: Boolean(value),
    length: value.length,
    sha256Prefix: value ? createHash("sha256").update(value).digest("hex").slice(0, 12) : "",
    masked: value ? `${value.slice(0, 4)}...${value.slice(-4)}` : ""
  };
}
