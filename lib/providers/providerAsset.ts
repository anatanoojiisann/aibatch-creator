import { ProviderAsset, ProviderDefinition } from "@/lib/providers/providerTypes";

export function assertProviderAssetScope(asset: ProviderAsset, provider: ProviderDefinition): ProviderAsset {
  if (asset.providerId !== provider.id || asset.providerGroup !== provider.group || asset.providerSource !== provider.source) {
    throw new Error(`Provider asset ${asset.providerAssetId || asset.localItemId} belongs to ${asset.providerId} and cannot be reused for ${provider.id}.`);
  }
  return asset;
}
