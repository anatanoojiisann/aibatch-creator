import { VideoBatch } from "@/lib/schemas/videoBatch.schema";

export type VideoFactoryAdapterConfig = {
  videoFactoryPath: string;
  bridgeUrl: string;
  apiKey?: string;
  commandTimeoutMs?: number;
  commandLogLimitBytes?: number;
  reconnectingWatchdogMs?: number;
};

export type VideoFactorySetupResult = {
  ok: boolean;
  errors: string[];
  warnings: string[];
};

export type VideoFactoryCommandResult = {
  ok: boolean;
  command: string;
  stdout: string;
  stderr: string;
  manifestPath?: string;
  resultJsonPath?: string;
  submissions?: VideoFactoryVideoSubmission[];
  runtimeDiagnostics?: VideoFactoryRuntimeDiagnostics;
  durationMs?: number;
  timedOut?: boolean;
  stdoutBytes?: number;
  stderrBytes?: number;
  stdoutTruncated?: boolean;
  stderrTruncated?: boolean;
  logLimitBytes?: number;
  unauthorizedDetected?: boolean;
  reconnectingWatchdog?: VideoFactoryReconnectWatchdogResult;
};

export type VideoFactoryVideoSubmission = {
  itemId?: string;
  dryRun?: boolean;
  ok?: boolean;
  submittedAt?: string;
  videoJobId?: string;
  videoUrl?: string;
  errorMessage?: string;
};

export type VideoFactoryRuntimeDiagnostics = {
  keyPresent: boolean;
  keyLength: number;
  keySha256Prefix: string;
  keyMasked: string;
  bridgeUrl: string;
  dryRun: boolean;
  videoFactoryPath: string;
  command?: string;
  envLocalExists: boolean;
  childProcessPixverseKeyPresent: boolean;
  commandTimeoutMs?: number;
  reconnectingWatchdogMs?: number;
};

export type VideoFactoryReconnectWatchdogResult = {
  triggered: boolean;
  thresholdMs: number;
  firstSeenAtMs?: number;
  lastSeenAtMs?: number;
  observationCount: number;
  pattern?: string;
  repairAction?: string;
  recommendedActions: string[];
};

export type VideoFactoryCommandLog = {
  command: string;
  stdout: string;
  stderr: string;
  runtimeDiagnostics?: VideoFactoryRuntimeDiagnostics;
  durationMs?: number;
  timedOut?: boolean;
  stdoutBytes?: number;
  stderrBytes?: number;
  stdoutTruncated?: boolean;
  stderrTruncated?: boolean;
  logLimitBytes?: number;
  reconnectingWatchdog?: VideoFactoryReconnectWatchdogResult;
};

export type ImageGenerationMode = "mock" | "dry-run" | "real";

export type GenerateReferenceImagesOptions = {
  batchId: string;
  promptDir: string;
  mode: ImageGenerationMode;
  limit?: number;
  modelLimit?: number;
  models?: string[];
  bridgeUrl: string;
  apiKey?: string;
  confirmRealRun?: boolean;
};

export type GenerateReferenceImagesResult = {
  ok: boolean;
  mode: ImageGenerationMode;
  submitted: number;
  synced: number;
  imported: number;
  imageResultPath?: string;
  syncResultPath?: string;
  importedImages: Array<{
    itemId: string;
    sourcePath: string;
    localPath: string;
    previewUrl: string;
  }>;
  commandLogs: VideoFactoryCommandLog[];
  errorCode?: string;
  message?: string;
  runtimeDiagnostics?: VideoFactoryRuntimeDiagnostics;
  zipPath?: string;
  extractedDir?: string;
  foundImageCount?: number;
  firstImagePath?: string;
  targetCopyPath?: string;
  copyError?: string;
};

export type SyncRealImagesOptions = {
  batchId: string;
  limit?: number;
  existingOnly?: boolean;
};

export type SubmitImagesOptions = {
  promptDir: string;
  remote?: boolean;
  dryRun?: boolean;
  limit?: number;
  modelLimit?: number;
  confirmedRemote?: boolean;
  confirmedFullBatch?: boolean;
};

export type SyncRelaxImagesOptions = {
  date?: "today" | string;
  deleteRemote?: boolean;
};

export type SubmitVideosOptions = {
  batchId: string;
  promptDir: string;
  imageUrlMapPath: string;
  bridgeUrl?: string;
  remote?: boolean;
  dryRun?: boolean;
  limit?: number;
  modelLimit?: number;
  confirmedRemote?: boolean;
  confirmedFullBatch?: boolean;
};

export type ReadResultManifestResult = {
  items: Array<{
    itemId: string;
    imageStatus?: string;
    imageLocalPath?: string;
    imagePublicUrl?: string;
    videoStatus?: string;
    videoJobId?: string;
    videoUrl?: string;
    errorCode?: string;
    errorMessage?: string;
  }>;
};

export type UploadPublicImagesResult = Awaited<ReturnType<VideoFactoryUploadHandler>>;

export type VideoFactoryUploadHandler = (batch: VideoBatch) => Promise<{
  ok: boolean;
  imageUrlMapPath: string;
  uploaded: Array<{ itemId: string; publicUrl: string }>;
  failed: Array<{ itemId: string; error: string }>;
}>;
