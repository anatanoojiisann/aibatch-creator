import { ProviderEndpointManifestEntry } from "@/lib/providers/providerTypes";

export const paiOfficialEndpointManifest: ProviderEndpointManifestEntry[] = [
  {
    id: "pai_official_manifest_incomplete",
    providerId: "pai_official_api",
    providerGroup: "pai",
    providerSource: "official_api",
    method: "GET",
    path: "",
    baseUrlEnvKey: "PAI_OFFICIAL_BASE_URL",
    docsUrl: "",
    authRequired: true,
    capability: "credit_balance",
    requestSchema: "API docs not configured",
    responseSchema: "API docs not configured",
    implemented: false,
    stability: "incomplete",
    notes: "Pai official API docs are not configured. Do not reuse PixVerse official endpoints."
  }
];
