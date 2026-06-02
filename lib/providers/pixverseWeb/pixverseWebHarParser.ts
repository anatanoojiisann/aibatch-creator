import { redactHarSecrets } from "@/lib/providers/shared/webHar/redactHarSecrets";
import { parseObservedWebEndpoints } from "@/lib/providers/shared/webHar/parseObservedWebEndpoints";

export function parsePixVerseWebHar(har: unknown, sourceFileName?: string) {
  return {
    ...parseObservedWebEndpoints("pixverse_web", har, sourceFileName),
    redactedHar: redactHarSecrets(har)
  };
}
