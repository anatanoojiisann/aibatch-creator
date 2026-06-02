import { ProviderEndpointManifestEntry } from "@/lib/providers/providerTypes";

export const paiWebObservedEndpointManifest: ProviderEndpointManifestEntry[] = [];

export function replacePaiWebObservedEndpointManifest(endpoints: ProviderEndpointManifestEntry[]) {
  paiWebObservedEndpointManifest.splice(0, paiWebObservedEndpointManifest.length, ...endpoints);
}
