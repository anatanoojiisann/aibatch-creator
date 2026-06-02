import { VideoBatch } from "@/lib/schemas/videoBatch.schema";
import { assertProviderAssetScope } from "@/lib/providers/providerAsset";
import { requireProviderCapability } from "@/lib/providers/providerCapability";
import { getProviderDefinition } from "@/lib/providers/providerRegistry";
import { ProviderId } from "@/lib/providers/providerTypes";

export function validateSelectedProviderVideoSubmission(batch: VideoBatch, providerId: ProviderId) {
  const capability = requireProviderCapability(providerId, "image_to_video");
  if (!capability.ok) return capability;
  const provider = getProviderDefinition(providerId);
  const eligible = batch.items.filter((item) => item.referenceImage.status === "uploaded_public" || item.referenceImage.status === "approved");
  const assets = eligible.flatMap((item) => item.referenceImage.providerAssets || [])
    .filter((asset) => asset.providerId === providerId);
  if (assets.length === 0) {
    return {
      ok: false as const,
      errorCode: "PROVIDER_ASSET_REQUIRED" as const,
      providerId,
      capability: "image_to_video" as const,
      message: `${provider.label} requires a provider-scoped uploaded image asset before real image-to-video submission.`
    };
  }
  assets.forEach((asset) => assertProviderAssetScope(asset, provider));
  return { ok: true as const, provider, assets };
}
