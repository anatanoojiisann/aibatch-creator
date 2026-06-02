import { customPlatformEndpointManifest } from "@/lib/providers/custom/customPlatformEndpointManifest";
import { paiOfficialEndpointManifest } from "@/lib/providers/paiOfficial/paiOfficialEndpointManifest";
import { paiWebObservedEndpointManifest } from "@/lib/providers/paiWeb/paiWebObservedEndpointManifest";
import { pixverseOfficialEndpointManifest } from "@/lib/providers/pixverseOfficial/pixverseOfficialEndpointManifest";
import { pixverseWebObservedEndpointManifest } from "@/lib/providers/pixverseWeb/pixverseWebObservedEndpointManifest";
import { ProviderDefinition, ProviderId } from "@/lib/providers/providerTypes";

const providers: ProviderDefinition[] = [
  {
    id: "pixverse_official_api",
    group: "pixverse",
    source: "official_api",
    label: "PixVerse Official API",
    accountScope: "pixverse",
    credentialEnvKeys: ["PIXVERSE_OFFICIAL_API_KEY"],
    baseUrlEnvKey: "PIXVERSE_OFFICIAL_BASE_URL",
    balanceScope: "pixverse_official",
    stable: true,
    capabilities: ["credit_balance", "upload_image", "image_to_video", "video_status"],
    endpointManifest: pixverseOfficialEndpointManifest,
    limitations: ["Uses PixVerse Platform API credits, separate from PixVerse web credits.", "Requires a PixVerse official img_id before image-to-video submission."]
  },
  {
    id: "pixverse_web",
    group: "pixverse",
    source: "web",
    label: "PixVerse Web",
    accountScope: "pixverse",
    credentialEnvKeys: [],
    baseUrlEnvKey: "PIXVERSE_WEB_BASE_URL",
    sessionMode: "manual_har",
    sessionProfileEnvKey: "PIXVERSE_WEB_SESSION_PROFILE",
    balanceScope: "pixverse_web",
    stable: false,
    experimental: true,
    capabilities: [],
    endpointManifest: pixverseWebObservedEndpointManifest,
    limitations: ["Experimental manual HAR analysis only.", "No automatic actions, CAPTCHA bypass, stealth automation, or cookie printing."]
  },
  {
    id: "pai_official_api",
    group: "pai",
    source: "official_api",
    label: "Pai Official API",
    accountScope: "pai",
    credentialEnvKeys: ["PAI_OFFICIAL_API_KEY"],
    baseUrlEnvKey: "PAI_OFFICIAL_BASE_URL",
    balanceScope: "pai_official",
    stable: false,
    capabilities: [],
    endpointManifest: paiOfficialEndpointManifest,
    limitations: ["API docs not configured / endpoint manifest incomplete.", "PixVerse official endpoints are not reused."]
  },
  {
    id: "pai_web",
    group: "pai",
    source: "web",
    label: "Pai Web",
    accountScope: "pai",
    credentialEnvKeys: [],
    baseUrlEnvKey: "PAI_WEB_BASE_URL",
    sessionMode: "manual_har",
    sessionProfileEnvKey: "PAI_WEB_SESSION_PROFILE",
    balanceScope: "pai_web",
    stable: false,
    experimental: true,
    capabilities: [],
    endpointManifest: paiWebObservedEndpointManifest,
    limitations: ["Experimental Pai-specific manual HAR analysis only.", "No automatic actions, CAPTCHA bypass, stealth automation, or cookie printing."]
  },
  {
    id: "custom_platform",
    group: "custom",
    source: "official_api",
    label: "My Platform",
    accountScope: "custom",
    credentialEnvKeys: ["CUSTOM_PLATFORM_API_KEY"],
    baseUrlEnvKey: "CUSTOM_PLATFORM_BASE_URL",
    balanceScope: "custom",
    stable: false,
    capabilities: [],
    endpointManifest: customPlatformEndpointManifest,
    limitations: ["Configure custom platform endpoints explicitly before enabling capabilities."]
  }
];

export function getProviderRegistry(): ProviderDefinition[] {
  return providers;
}

export function getProviderDefinition(providerId: ProviderId): ProviderDefinition {
  const provider = providers.find((entry) => entry.id === providerId);
  if (!provider) throw new Error(`Unknown provider: ${providerId}`);
  return provider;
}

export function isProviderId(value: unknown): value is ProviderId {
  return providers.some((provider) => provider.id === value);
}
