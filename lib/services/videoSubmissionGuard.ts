import { VideoBatch } from "@/lib/schemas/videoBatch.schema";
import { isRealPublicHttpsUrl, realPublicImageUrlMessage } from "@/lib/services/videoAssetValidation";

export type VideoSubmitErrorCode =
  | "PROMPT_DIR_MISSING"
  | "NO_APPROVED_PUBLIC_IMAGES"
  | "MISSING_IMAGE_URL_MAP"
  | "REAL_PUBLIC_IMAGE_URL_REQUIRED";

export type VideoWorkflowPrerequisites = {
  promptDirExported: boolean;
  imagesSubmitted: boolean;
  imagesSynced: boolean;
  atLeastOneImageApproved: boolean;
  publicImageUrlGenerated: boolean;
  realPublicImageUrlReady: boolean;
  imageUrlMapGenerated: boolean;
  readyToSubmitVideos: boolean;
};

export type VideoSubmitValidation = {
  ok: boolean;
  errorCode?: VideoSubmitErrorCode;
  message?: string;
  missingRequirements: string[];
  prerequisites: VideoWorkflowPrerequisites;
};

const imageSubmittedStatuses = new Set([
  "submitted",
  "syncing",
  "waiting_for_real_output",
  "downloaded",
  "ready_for_preview",
  "approved",
  "uploaded_public"
]);

const imageSyncedStatuses = new Set([
  "downloaded",
  "ready_for_preview",
  "approved",
  "uploaded_public"
]);

export function getVideoWorkflowPrerequisites(batch: VideoBatch, imageUrlMapFileExists = true): VideoWorkflowPrerequisites {
  const promptDirExported = Boolean(batch.videoFactory.promptDir);
  const imagesSubmitted = batch.items.some((item) => imageSubmittedStatuses.has(item.referenceImage.status));
  const imagesSynced = batch.items.some((item) => imageSyncedStatuses.has(item.referenceImage.status) && Boolean(item.referenceImage.localPath || item.referenceImage.previewUrl));
  const atLeastOneImageApproved = batch.items.some((item) => item.referenceImage.status === "approved" || item.referenceImage.status === "uploaded_public");
  const publicImageUrlGenerated = batch.items.some((item) => item.referenceImage.status === "uploaded_public" && Boolean(item.referenceImage.publicUrl));
  const realPublicImageUrlReady = batch.items.some((item) => item.referenceImage.status === "uploaded_public" && isRealPublicHttpsUrl(item.referenceImage.publicUrl));
  const imageUrlMapGenerated = Boolean(batch.videoFactory.imageUrlMapPath)
    && imageUrlMapFileExists;
  const readyToSubmitVideos = promptDirExported && publicImageUrlGenerated && imageUrlMapGenerated;
  return {
    promptDirExported,
    imagesSubmitted,
    imagesSynced,
    atLeastOneImageApproved,
    publicImageUrlGenerated,
    realPublicImageUrlReady,
    imageUrlMapGenerated,
    readyToSubmitVideos
  };
}

export function validateVideoSubmitPrerequisites(
  batch: VideoBatch,
  imageUrlMapFileExists = true,
  options: { requireRealPublicImageUrl?: boolean; imageUrlMap?: Record<string, string> } = {}
): VideoSubmitValidation {
  const prerequisites = getVideoWorkflowPrerequisites(batch, imageUrlMapFileExists);
  const missingRequirements: string[] = [];
  if (!prerequisites.promptDirExported) missingRequirements.push("Prompt dir exported");
  if (!prerequisites.imagesSubmitted) missingRequirements.push("Images submitted");
  if (!prerequisites.imagesSynced) missingRequirements.push("Images synced");
  if (!prerequisites.atLeastOneImageApproved) missingRequirements.push("At least one image approved");
  if (!prerequisites.publicImageUrlGenerated) missingRequirements.push("Public image URL generated");
  if (!prerequisites.imageUrlMapGenerated) missingRequirements.push("Image URL map generated");
  if (options.requireRealPublicImageUrl && !prerequisites.realPublicImageUrlReady) missingRequirements.push("Real public HTTPS image URL");

  if (!prerequisites.promptDirExported) {
    return {
      ok: false,
      errorCode: "PROMPT_DIR_MISSING",
      message: "Export prompt-dir before submitting videos.",
      missingRequirements,
      prerequisites
    };
  }

  if (!prerequisites.publicImageUrlGenerated) {
    return {
      ok: false,
      errorCode: "NO_APPROVED_PUBLIC_IMAGES",
      message: "At least one approved image must be uploaded to a public HTTPS URL before submitting videos.",
      missingRequirements,
      prerequisites
    };
  }

  if (!prerequisites.imageUrlMapGenerated) {
    return {
      ok: false,
      errorCode: "MISSING_IMAGE_URL_MAP",
      message: "Generate image-url-map.json before submitting videos.",
      missingRequirements,
      prerequisites
    };
  }

  if (options.requireRealPublicImageUrl) {
    const eligibleItems = batch.items.filter((item) => item.referenceImage.status === "uploaded_public" && item.referenceImage.publicUrl);
    const realMapReady = eligibleItems.length > 0
      && eligibleItems.every((item) => isRealPublicHttpsUrl(options.imageUrlMap?.[item.id] || item.referenceImage.publicUrl));
    if (!realMapReady) {
      return {
        ok: false,
        errorCode: "REAL_PUBLIC_IMAGE_URL_REQUIRED",
        message: realPublicImageUrlMessage,
        missingRequirements,
        prerequisites
      };
    }
  }

  return {
    ok: true,
    missingRequirements: [],
    prerequisites
  };
}

export function nextRecommendedAction(prerequisites: VideoWorkflowPrerequisites): string {
  if (!prerequisites.promptDirExported) return "Next: export prompt-dir.";
  if (!prerequisites.imagesSubmitted || !prerequisites.imagesSynced) return "Next: generate reference images.";
  if (!prerequisites.atLeastOneImageApproved || !prerequisites.publicImageUrlGenerated) return "Next: approve at least one image.";
  if (!prerequisites.imageUrlMapGenerated) return "Next: generate videos from approved images.";
  return "Ready to submit videos.";
}
