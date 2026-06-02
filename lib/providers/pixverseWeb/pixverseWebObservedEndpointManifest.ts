import { ProviderEndpointManifestEntry } from "@/lib/providers/providerTypes";

export const pixverseWebObservedEndpointManifest: ProviderEndpointManifestEntry[] = [];

export function replacePixVerseWebObservedEndpointManifest(endpoints: ProviderEndpointManifestEntry[]) {
  pixverseWebObservedEndpointManifest.splice(0, pixverseWebObservedEndpointManifest.length, ...endpoints);
}
