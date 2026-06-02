import { z } from "zod";
import { VideoCreativeItemSchema } from "@/lib/schemas/videoCreativeItem.schema";

export const VideoBatchStatusSchema = z.enum([
  "draft",
  "prompts_ready",
  "prompt_dir_exported",
  "image_submitting",
  "image_submitted",
  "image_syncing",
  "image_ready_for_preview",
  "image_public_url_ready",
  "video_submitting",
  "video_generating",
  "video_ready",
  "watermark_processing",
  "completed",
  "failed"
]);

export const VideoBatchSchema = z.object({
  id: z.string(),
  title: z.string(),
  sourceTopic: z.string(),
  platform: z.enum(["tiktok", "xiaohongshu", "youtube_shorts", "other"]),
  aspectRatio: z.enum(["9:16", "16:9", "1:1"]),
  status: VideoBatchStatusSchema,
  providerSetup: z.object({
    selectedProviderId: z.enum(["pixverse_official_api", "pixverse_web", "pai_official_api", "pai_web", "custom_platform"])
  }).optional(),
  videoFactory: z.object({
    promptDir: z.string().optional(),
    outputDir: z.string().optional(),
    imageUrlMapPath: z.string().optional(),
    resultManifestPath: z.string().optional(),
    videoResultJsonPath: z.string().optional(),
    videoSubmitCommand: z.string().optional()
  }),
  items: z.array(VideoCreativeItemSchema),
  createdAt: z.string(),
  updatedAt: z.string()
});

export type VideoBatch = z.infer<typeof VideoBatchSchema>;
export type VideoBatchStatus = z.infer<typeof VideoBatchStatusSchema>;
