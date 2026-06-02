import { ProviderDefinition, ProviderVideoTask } from "@/lib/providers/providerTypes";

export function assertProviderVideoTaskScope(task: ProviderVideoTask, provider: ProviderDefinition): ProviderVideoTask {
  if (
    task.providerId !== provider.id
    || task.providerGroup !== provider.group
    || task.providerSource !== provider.source
    || task.accountScope !== provider.accountScope
  ) {
    throw new Error(`Provider task ${task.providerTaskId || "unknown"} belongs to ${task.providerId} and cannot be reused for ${provider.id}.`);
  }
  return task;
}
