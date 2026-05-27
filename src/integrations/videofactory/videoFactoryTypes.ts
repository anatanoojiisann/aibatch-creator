import { VideoBatch } from "@/schemas/videoBatch.schema";

export type VideoFactoryAdapterConfig = {
  videoFactoryPath: string;
  bridgeUrl: string;
  apiKey?: string;
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
};

export type VideoFactorySyncResult = {
  ok: boolean;
  outputDir: string;
  downloadedFiles: string[];
  manifestPath?: string;
};

export type VideoFactoryReadManifestResult = {
  items: Array<{
    itemId: string;
    imageStatus?: string;
    imageLocalPath?: string;
    imagePublicUrl?: string;
    imageJobId?: string;
    videoStatus?: string;
    videoJobId?: string;
    videoUrl?: string;
    errorCode?: string;
    errorMessage?: string;
  }>;
};

export type VideoFactorySubmitImagesOptions = {
  promptDir: string;
  remote: boolean;
  dryRun?: boolean;
  limit?: number;
  modelLimit?: number;
  models?: string[];
  batchId?: string;
};

export type VideoFactorySyncImagesOptions = {
  date?: "today" | string;
  deleteRemote?: boolean;
  batchId?: string;
  outputDir?: string;
};

export type VideoFactorySubmitVideosOptions = {
  promptDir: string;
  imageUrlMapPath: string;
  remote: boolean;
  dryRun?: boolean;
  limit?: number;
  batchId?: string;
};

export type VideoFactoryPromptDirResult = {
  promptDir: string;
  files: Array<{ itemId: string; filePath: string }>;
};

export type UploadPublicImagesHandler = (batch: VideoBatch) => Promise<{
  ok: boolean;
  imageUrlMapPath: string;
  uploaded: Array<{ itemId: string; publicUrl: string }>;
  failed: Array<{ itemId: string; error: string }>;
}>;
