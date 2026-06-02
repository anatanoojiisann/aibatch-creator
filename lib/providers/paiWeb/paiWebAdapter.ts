import { ProviderCapability } from "@/lib/providers/providerTypes";

export class PaiWebAdapter {
  readonly providerId = "pai_web" as const;
  readonly sessionMode = "manual_har" as const;
  readonly sessionProfileEnvKey = "PAI_WEB_SESSION_PROFILE";
  readonly experimental = true;

  unsupported(capability: ProviderCapability) {
    return {
      ok: false as const,
      errorCode: "PROVIDER_CAPABILITY_UNSUPPORTED" as const,
      providerId: this.providerId,
      capability,
      message: "Pai Web is experimental manual HAR analysis only. Automatic web actions are disabled."
    };
  }
}
