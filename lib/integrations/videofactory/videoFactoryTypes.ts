import { VideoBatch } from "@/lib/schemas/videoBatch.schema";

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
  promptDir: string;
  imageUrlMapPath: string;
  remote?: boolean;
  dryRun?: boolean;
  limit?: number;
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
