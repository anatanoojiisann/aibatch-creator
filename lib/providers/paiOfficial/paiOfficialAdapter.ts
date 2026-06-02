import { ProviderCapability } from "@/lib/providers/providerTypes";

export class PaiOfficialAdapter {
  readonly providerId = "pai_official_api" as const;
  readonly credentialEnvKey = "PAI_OFFICIAL_API_KEY";

  unsupported(capability: ProviderCapability) {
    return {
      ok: false as const,
      errorCode: "PROVIDER_CAPABILITY_UNSUPPORTED" as const,
      providerId: this.providerId,
      capability,
      message: "Pai official API docs are not configured / endpoint manifest incomplete."
    };
  }

  getCreditBalance() {
    return this.unsupported("credit_balance");
  }
}
