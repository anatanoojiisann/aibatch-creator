import { z } from "zod";

const ProviderGroupSchema = z.enum(["pixverse", "pai", "custom"]);
const ProviderSourceSchema = z.enum(["official_api", "web"]);
const ProviderIdSchema = z.enum(["pixverse_official_api", "pixverse_web", "pai_official_api", "pai_web", "custom_platform"]);
const ProviderAssetSchema = z.object({
  providerId: ProviderIdSchema,
  providerGroup: ProviderGroupSchema,
  providerSource: ProviderSourceSchema,
  localBatchId: z.string(),
  localItemId: z.string(),
  providerAssetId: z.string().optional(),
  providerAssetUrl: z.string().optional(),
  localPath: z.string().optional(),
  previewUrl: z.string().optional(),
  uploadedAt: z.string(),
  rawResponse: z.unknown().optional()
});

export const ReferenceImageStatusSchema = z.enum([
  "missing",
  "pending",
  "submitting",
  "submitted",
  "syncing",
  "waiting_for_real_output",
  "downloaded",
  "ready_for_preview",
  "approved",
  "rejected",
  "uploaded_public",
  "failed"
]);

export const GenerationStatusSchema = z.enum([
  "draft",
  "video_draft",
  "waiting_for_image",
  "ready_for_video",
  "video_mocked",
  "video_dry_run",
  "video_submitting",
  "video_submitted",
  "video_generating",
  "waiting_for_real_video_output",
  "video_succeeded",
  "video_failed",
  "video_rejected"
]);

export const WatermarkStatusSchema = z.enum([
  "pending",
  "queued",
  "processing",
  "done",
  "failed"
]);

export const VideoCreativeItemSchema = z.object({
  id: z.string(),
  batchId: z.string(),
  index: z.number().int().positive(),
  persona: z.string().optional(),
  title: z.string(),
  referenceImagePrompt: z.string(),
  videoPrompt: z.string(),
  promptParts: z.object({
    action: z.string(),
    character: z.string(),
    expression: z.string(),
    shots: z.array(z.object({
      shotNo: z.number().int().positive(),
      durationSec: z.number().positive(),
      camera: z.string(),
      action: z.string(),
      environment: z.string(),
      lighting: z.string()
    })),
    environment: z.string(),
    lighting: z.string(),
    camera: z.string(),
    musicStyle: z.string(),
    dialogue: z.string(),
    negativePrompt: z.string()
  }),
  referenceImage: z.object({
    status: ReferenceImageStatusSchema,
    localPath: z.string().optional(),
    previewUrl: z.string().optional(),
    publicUrl: z.string().optional(),
    generatorProviderId: z.string().optional(),
    providerAssets: z.array(ProviderAssetSchema).optional(),
    errorCode: z.string().optional(),
    errorMessage: z.string().optional()
  }),
  generation: z.object({
    status: GenerationStatusSchema,
    videoJobId: z.string().optional(),
    videoUrl: z.string().optional(),
    localPath: z.string().optional(),
    previewUrl: z.string().optional(),
    submitCommand: z.string().optional(),
    resultJsonPath: z.string().optional(),
    submittedAt: z.string().optional(),
    lastSyncAt: z.string().optional(),
    syncAttempts: z.number().int().nonnegative().optional(),
    dryRun: z.boolean().optional(),
    providerId: ProviderIdSchema.optional(),
    providerGroup: ProviderGroupSchema.optional(),
    providerSource: ProviderSourceSchema.optional(),
    accountScope: ProviderGroupSchema.optional(),
    providerTaskId: z.string().optional(),
    providerAssetId: z.string().optional(),
    providerUploadId: z.string().optional(),
    providerCreditBalanceSnapshot: z.unknown().optional(),
    providerRawStatus: z.unknown().optional(),
    providerRawResponse: z.unknown().optional(),
    errorCode: z.string().optional(),
    errorMessage: z.string().optional()
  }),
  postProcessing: z.object({
    watermarkStatus: WatermarkStatusSchema,
    processedVideoUrl: z.string().optional(),
    errorCode: z.string().optional(),
    errorMessage: z.string().optional()
  })
});

export type VideoCreativeItem = z.infer<typeof VideoCreativeItemSchema>;
