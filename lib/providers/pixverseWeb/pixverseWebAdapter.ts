import { ProviderCapability } from "@/lib/providers/providerTypes";

export class PixVerseWebAdapter {
  readonly providerId = "pixverse_web" as const;
  readonly sessionMode = "manual_har" as const;
  readonly sessionProfileEnvKey = "PIXVERSE_WEB_SESSION_PROFILE";
  readonly experimental = true;

  unsupported(capability: ProviderCapability) {
    return {
      ok: false as const,
      errorCode: "PROVIDER_CAPABILITY_UNSUPPORTED" as const,
      providerId: this.providerId,
      capability,
      message: "PixVerse Web is experimental manual HAR analysis only. Automatic web actions are disabled."
    };
  }
}
