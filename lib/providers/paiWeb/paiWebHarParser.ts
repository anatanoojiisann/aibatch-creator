import { redactHarSecrets } from "@/lib/providers/shared/webHar/redactHarSecrets";
import { parseObservedWebEndpoints } from "@/lib/providers/shared/webHar/parseObservedWebEndpoints";

export function parsePaiWebHar(har: unknown, sourceFileName?: string) {
  return {
    ...parseObservedWebEndpoints("pai_web", har, sourceFileName),
    redactedHar: redactHarSecrets(har)
  };
}
