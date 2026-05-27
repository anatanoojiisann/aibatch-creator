import { z } from "zod";

export const VideoFactoryManifestItemSchema = z.object({
  itemId: z.string(),
  imageStatus: z.string().optional(),
  imageLocalPath: z.string().optional(),
  imagePublicUrl: z.string().optional(),
  videoStatus: z.string().optional(),
  videoJobId: z.string().optional(),
  videoUrl: z.string().optional(),
  errorCode: z.string().optional(),
  errorMessage: z.string().optional(),
});

export const VideoFactoryManifestSchema = z.object({
  batchId: z.string().optional(),
  source: z.string().optional(),
  dryRun: z.boolean().optional(),
  submitted: z.number().optional(),
  synced: z.array(z.unknown()).optional(),
  submissions: z.array(z.unknown()).optional(),
  items: z.array(VideoFactoryManifestItemSchema).optional(),
  updatedAt: z.string().optional(),
});

export type VideoFactoryManifestItem = z.infer<typeof VideoFactoryManifestItemSchema>;
export type VideoFactoryManifest = z.infer<typeof VideoFactoryManifestSchema>;
