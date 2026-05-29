import { VideoBatch } from "@/lib/schemas/videoBatch.schema";

export type VideoSubmitErrorCode =
  | "PROMPT_DIR_MISSING"
  | "NO_APPROVED_PUBLIC_IMAGES"
  | "MISSING_IMAGE_URL_MAP";

export type VideoWorkflowPrerequisites = {
  promptDirExported: boolean;
  imagesSubmitted: boolean;
  imagesSynced: boolean;
  atLeastOneImageApproved: boolean;
  publicImageUrlGenerated: boolean;
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
  const imageUrlMapGenerated = Boolean(batch.videoFactory.imageUrlMapPath)
    && imageUrlMapFileExists;
  const readyToSubmitVideos = promptDirExported && publicImageUrlGenerated && imageUrlMapGenerated;
  return {
    promptDirExported,
    imagesSubmitted,
    imagesSynced,
    atLeastOneImageApproved,
    publicImageUrlGenerated,
    imageUrlMapGenerated,
    readyToSubmitVideos
  };
}

export function validateVideoSubmitPrerequisites(batch: VideoBatch, imageUrlMapFileExists = true): VideoSubmitValidation {
  const prerequisites = getVideoWorkflowPrerequisites(batch, imageUrlMapFileExists);
  const missingRequirements: string[] = [];
  if (!prerequisites.promptDirExported) missingRequirements.push("Prompt dir exported");
  if (!prerequisites.imagesSubmitted) missingRequirements.push("Images submitted");
  if (!prerequisites.imagesSynced) missingRequirements.push("Images synced");
  if (!prerequisites.atLeastOneImageApproved) missingRequirements.push("At least one image approved");
  if (!prerequisites.publicImageUrlGenerated) missingRequirements.push("Public image URL generated");
  if (!prerequisites.imageUrlMapGenerated) missingRequirements.push("Image URL map generated");

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

  return {
    ok: true,
    missingRequirements: [],
    prerequisites
  };
}

export function nextRecommendedAction(prerequisites: VideoWorkflowPrerequisites): string {
  if (!prerequisites.promptDirExported) return "Please export the prompt-dir before submitting videos.";
  if (!prerequisites.imagesSubmitted) return "Please run Dry-run Submit Images before submitting videos.";
  if (!prerequisites.imagesSynced) return "Please run Mock Sync Images before approving and uploading images.";
  if (!prerequisites.atLeastOneImageApproved) return "Please approve at least one synced image.";
  if (!prerequisites.publicImageUrlGenerated) return "Please mock upload at least one approved image to generate a public HTTPS URL.";
  if (!prerequisites.imageUrlMapGenerated) return "Please generate image-url-map.json before submitting videos.";
  return "Ready to submit videos.";
}
