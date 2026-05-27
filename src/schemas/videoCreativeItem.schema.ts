import { z } from "zod";

export const ReferenceImageStatusSchema = z.enum([
  "missing",
  "pending",
  "submitted",
  "downloaded",
  "ready_for_preview",
  "approved",
  "uploaded_public",
  "failed",
]);

export const VideoGenerationStatusSchema = z.enum([
  "draft",
  "waiting_for_image",
  "ready_for_video",
  "video_submitted",
  "video_generating",
  "video_succeeded",
  "video_failed",
]);

export const WatermarkStatusSchema = z.enum([
  "pending",
  "queued",
  "processing",
  "done",
  "failed",
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
      lighting: z.string(),
    })),
    environment: z.string(),
    lighting: z.string(),
    camera: z.string(),
    musicStyle: z.string(),
    dialogue: z.string(),
    negativePrompt: z.string(),
  }),
  referenceImage: z.object({
    status: ReferenceImageStatusSchema,
    localPath: z.string().optional(),
    previewUrl: z.string().optional(),
    publicUrl: z.string().optional(),
    remoteBatchId: z.string().optional(),
    imageJobId: z.string().optional(),
    errorCode: z.string().optional(),
    errorMessage: z.string().optional(),
  }),
  generation: z.object({
    provider: z.literal("videofactory"),
    status: VideoGenerationStatusSchema,
    videoJobId: z.string().optional(),
    videoUrl: z.string().optional(),
    localVideoPath: z.string().optional(),
    errorCode: z.string().optional(),
    errorMessage: z.string().optional(),
  }),
  postProcessing: z.object({
    watermarkStatus: WatermarkStatusSchema,
    watermarkMode: z.enum(["extra_fast", "balance", "quality"]).optional(),
    processedVideoUrl: z.string().optional(),
    errorCode: z.string().optional(),
    errorMessage: z.string().optional(),
  }),
});

export type VideoCreativeItem = z.infer<typeof VideoCreativeItemSchema>;
