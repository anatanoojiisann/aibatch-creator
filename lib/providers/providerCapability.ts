import { getProviderDefinition } from "@/lib/providers/providerRegistry";
import { ProviderCapability, ProviderId } from "@/lib/providers/providerTypes";

export function requireProviderCapability(providerId: ProviderId, capability: ProviderCapability) {
  const provider = getProviderDefinition(providerId);
  if (provider.capabilities.includes(capability)) return { ok: true as const, provider };
  return {
    ok: false as const,
    errorCode: "PROVIDER_CAPABILITY_UNSUPPORTED" as const,
    providerId,
    capability,
    message: `${provider.label} does not currently support ${capability}.`
  };
}
