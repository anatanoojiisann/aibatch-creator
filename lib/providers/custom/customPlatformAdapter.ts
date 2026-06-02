import { ProviderCapability } from "@/lib/providers/providerTypes";

export class CustomPlatformAdapter {
  readonly providerId = "custom_platform" as const;
  readonly credentialEnvKey = "CUSTOM_PLATFORM_API_KEY";

  unsupported(capability: ProviderCapability) {
    return {
      ok: false as const,
      errorCode: "PROVIDER_CAPABILITY_UNSUPPORTED" as const,
      providerId: this.providerId,
      capability,
      message: "Configure custom platform endpoints explicitly before enabling capabilities."
    };
  }
}
