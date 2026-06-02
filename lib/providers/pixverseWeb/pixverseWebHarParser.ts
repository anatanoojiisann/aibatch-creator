import { redactHarSecrets } from "@/lib/providers/shared/webHar/redactHarSecrets";

export type PixVerseWebHarObservation = {
  providerId: "pixverse_web";
  redactedHar: unknown;
  observedRequestCount: number;
};

export function parsePixVerseWebHar(har: unknown): PixVerseWebHarObservation {
  return {
    providerId: "pixverse_web",
    redactedHar: redactHarSecrets(har),
    observedRequestCount: requestCount(har)
  };
}

function requestCount(har: unknown): number {
  const entries = (har as { log?: { entries?: unknown[] } })?.log?.entries;
  return Array.isArray(entries) ? entries.length : 0;
}
