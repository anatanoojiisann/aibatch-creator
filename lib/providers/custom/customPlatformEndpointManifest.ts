import { ProviderEndpointManifestEntry } from "@/lib/providers/providerTypes";

export const customPlatformEndpointManifest: ProviderEndpointManifestEntry[] = [
  {
    id: "custom_platform_manifest_incomplete",
    providerId: "custom_platform",
    providerGroup: "custom",
    providerSource: "official_api",
    method: "GET",
    path: "",
    baseUrlEnvKey: "CUSTOM_PLATFORM_BASE_URL",
    docsUrl: "",
    authRequired: true,
    capability: "credit_balance",
    requestSchema: "Configure custom platform contract",
    responseSchema: "Configure custom platform contract",
    implemented: false,
    stability: "incomplete",
    notes: "Custom platform endpoints must be configured explicitly."
  }
];
