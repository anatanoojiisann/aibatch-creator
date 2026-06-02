import { VideoBatch } from "@/lib/schemas/videoBatch.schema";
import { ReadResultManifestResult } from "@/lib/integrations/videofactory/videoFactoryTypes";
import { isRealMp4Url, mockVideoMessage } from "@/lib/services/videoAssetValidation";

export function applyVideoFactoryResult(batch: VideoBatch, result: ReadResultManifestResult): VideoBatch {
  const items = batch.items.map((item) => {
    const update = result.items.find((entry) => entry.itemId === item.id);
    if (!update) return item;
    return {
      ...item,
      referenceImage: {
        ...item.referenceImage,
        status: mapImageStatus(update.imageStatus, item.referenceImage.status),
        localPath: update.imageLocalPath || item.referenceImage.localPath,
        previewUrl: update.imageLocalPath ? `/api/video-batches/image-preview?file=${encodeURIComponent(update.imageLocalPath)}` : item.referenceImage.previewUrl,
        publicUrl: update.imagePublicUrl || item.referenceImage.publicUrl,
        errorCode: update.errorCode || item.referenceImage.errorCode,
        errorMessage: update.errorMessage || item.referenceImage.errorMessage
      },
      generation: {
        ...item.generation,
        status: mapVideoStatus(update.videoStatus, item.generation.status),
        videoJobId: update.videoJobId || item.generation.videoJobId,
        videoUrl: update.videoUrl || item.generation.videoUrl,
        errorCode: update.videoStatus === "video_succeeded" && !isRealMp4Url(update.videoUrl) ? "MOCK_VIDEO_ONLY" : update.errorCode || item.generation.errorCode,
        errorMessage: update.videoStatus === "video_succeeded" && !isRealMp4Url(update.videoUrl) ? mockVideoMessage : update.errorMessage || item.generation.errorMessage,
      }
    };
  });
  return { ...batch, items };
}

function mapImageStatus(status: string | undefined, fallback: VideoBatch["items"][number]["referenceImage"]["status"]) {
  if (status === "failed") return "failed";
  if (status === "uploaded_public") return "uploaded_public";
  if (status === "ready_for_preview") return "ready_for_preview";
  if (status === "downloaded") return "downloaded";
  if (status === "submitted") return "submitted";
  return fallback;
}

function mapVideoStatus(status: string | undefined, fallback: VideoBatch["items"][number]["generation"]["status"]) {
  if (status === "video_failed") return "video_failed";
  if (status === "video_succeeded") return "video_succeeded";
  if (status === "video_generating") return "video_generating";
  if (status === "waiting_for_real_video_output") return "waiting_for_real_video_output";
  if (status === "video_submitted") return "video_submitted";
  return fallback;
}
