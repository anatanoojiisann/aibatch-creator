import { getProviderRegistry } from "@/lib/providers/providerRegistry";
import { getConfiguredEnvValue, readLocalProviderEnv, safeFingerprint } from "@/lib/providers/providerSettings";

export type ProviderDiagnostic = ReturnType<typeof getProviderDiagnostics>[number];

export function getProviderDiagnostics() {
  const localEnv = readLocalProviderEnv();
  return getProviderRegistry().map((provider) => {
    const credentials = provider.credentialEnvKeys.map((envKey) => ({
      envKey,
      ...safeFingerprint(getConfiguredEnvValue(envKey, localEnv))
    }));
    const baseUrl = provider.baseUrlEnvKey ? getConfiguredEnvValue(provider.baseUrlEnvKey, localEnv) : "";
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
      baseUrl,
      credentials,
      credentialStatus: provider.source === "web"
        ? "manual_har_session_required"
        : credentials.length > 0 && credentials.every((credential) => credential.present) ? "configured" : "missing",
      balanceStatus: provider.capabilities.includes("credit_balance") ? "supported_not_checked" : "unsupported",
      capabilities: provider.capabilities,
      endpointManifest: provider.endpointManifest,
      observedEndpointCount: provider.source === "web" ? provider.endpointManifest.length : undefined,
      limitations: provider.limitations
    };
  });
}
