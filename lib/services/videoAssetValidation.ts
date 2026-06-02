import type { VideoBatch } from "@/lib/schemas/videoBatch.schema";
import type { VideoCreativeItem } from "@/lib/schemas/videoCreativeItem.schema";

export const mockVideoMessage = "No real video has been generated yet. This is a mock placeholder result.";
export const realPublicImageUrlMessage = "Real video generation requires a real public HTTPS image URL. Current image URL is a placeholder. Configure a real public asset provider or manually provide a public image URL.";
export const watermarkRequiresRealVideoMessage = "Watermark processing requires a real generated video.";

const placeholderFragments = [
  "your-domain.example",
  "example.com",
  "placeholder",
  "localhost",
  "127.0.0.1"
];

export function isPlaceholderUrl(value: string | undefined): boolean {
  const normalized = String(value || "").trim().toLowerCase();
  return !normalized || placeholderFragments.some((fragment) => normalized.includes(fragment));
}

export function isRealPublicHttpsUrl(value: string | undefined): boolean {
  if (isPlaceholderUrl(value)) return false;
  try {
    return new URL(String(value)).protocol === "https:";
  } catch {
    return false;
  }
}

export function isRealMp4Url(value: string | undefined): boolean {
  if (!isRealPublicHttpsUrl(value)) return false;
  try {
    const url = new URL(String(value));
    return `${url.pathname}${url.search}`.toLowerCase().includes(".mp4");
  } catch {
    return false;
  }
}

export function hasRealVideoReference(item: VideoCreativeItem): boolean {
  return item.generation.status === "video_succeeded"
    && (isRealMp4Url(item.generation.videoUrl) || isLocalMp4Path(item.generation.localPath));
}

export function videoPreviewUrl(localPath: string): string {
  return `/api/video-batches/video-preview?file=${encodeURIComponent(localPath)}`;
}

export function normalizeFakeVideoSuccess(batch: VideoBatch): VideoBatch {
  const hasFakeVideoSuccess = batch.items.some((item) => item.generation.status === "video_succeeded" && !hasRealVideoReference(item));
  return {
    ...batch,
    status: hasFakeVideoSuccess && (batch.status === "completed" || batch.status === "video_ready")
      ? "image_public_url_ready"
      : batch.status,
    items: batch.items.map((item) => {
      if (item.generation.status !== "video_succeeded" || hasRealVideoReference(item)) return item;
      return {
        ...item,
        generation: {
          ...item.generation,
          status: "video_mocked" as const,
          errorCode: "MOCK_VIDEO_ONLY",
          errorMessage: mockVideoMessage
        },
        postProcessing: item.postProcessing.watermarkStatus === "done"
          ? { watermarkStatus: "pending" as const, errorCode: "REAL_VIDEO_REQUIRED", errorMessage: watermarkRequiresRealVideoMessage }
          : item.postProcessing
      };
    })
  };
}

function isLocalMp4Path(value: string | undefined): boolean {
  return Boolean(value && value.toLowerCase().endsWith(".mp4"));
}
