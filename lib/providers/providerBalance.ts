import { PixVerseOfficialAdapter } from "@/lib/providers/pixverseOfficial/pixverseOfficialAdapter";
import { ProviderId, UnsupportedProviderCapability } from "@/lib/providers/providerTypes";

export async function getCreditBalance(providerId: ProviderId, fetcher: typeof fetch = fetch) {
  if (providerId === "pixverse_official_api") return new PixVerseOfficialAdapter(fetcher).getCreditBalance();
  return unsupportedCreditBalance(providerId);
}

function unsupportedCreditBalance(providerId: ProviderId): UnsupportedProviderCapability {
  return {
    ok: false,
    errorCode: "PROVIDER_CAPABILITY_UNSUPPORTED",
    providerId,
    capability: "credit_balance"
  };
}
