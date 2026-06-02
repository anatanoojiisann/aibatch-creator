"use client";

import { VideoBatch } from "@/lib/schemas/videoBatch.schema";
import { getVideoWorkflowPrerequisites, nextRecommendedAction } from "@/lib/services/videoSubmissionGuard";

export function WorkflowActions({ batch, disabled, onRun, onBlocked }: {
  batch: VideoBatch | null;
  disabled?: boolean;
  onRun: (path: string, body?: Record<string, unknown>) => void;
  onBlocked?: (message: string) => void;
}) {
  const readyIds = batch?.items.filter((item) => item.referenceImage.status === "ready_for_preview").map((item) => item.id) || [];
  const prerequisites = batch ? getVideoWorkflowPrerequisites(batch) : null;
  const canSubmitVideos = Boolean(batch && prerequisites?.readyToSubmitVideos);

  function submitVideos() {
    if (!batch || !prerequisites) return;
    if (!prerequisites.readyToSubmitVideos) {
      onBlocked?.(`${nextRecommendedAction(prerequisites)}\n\nPlease run Mock Sync Images, approve at least one image, mock upload it, and generate image-url-map.json before submitting videos.`);
      return;
    }
    onRun("/api/video-batches/submit-videos", { batchId: batch.id, dryRun: true, limit: 1 });
  }

  return (
    <div className="actions">
      <button disabled={!batch || disabled} onClick={() => batch && onRun("/api/video-batches/export-prompt-dir", { batchId: batch.id })}>Export Prompt Dir</button>
      <button disabled={!batch || disabled} onClick={() => batch && onRun("/api/video-batches/submit-images", { batchId: batch.id, dryRun: true, limit: 1 })}>Dry-run Submit Images</button>
      <button disabled={!batch || disabled} onClick={() => batch && onRun("/api/video-batches/sync-images", { batchId: batch.id, mock: true })}>Mock Sync Images</button>
      <button disabled={!batch || disabled || readyIds.length === 0} onClick={() => batch && onRun("/api/video-batches/upload-public-images", { batchId: batch.id, approvedItemIds: readyIds.slice(0, 1) })}>Approve 1 + Mock Upload</button>
      <button disabled={!batch || disabled} onClick={() => batch && onRun("/api/video-batches/generate-image-url-map", { batchId: batch.id })}>Generate Image URL Map</button>
      <button disabled={!canSubmitVideos || disabled} onClick={submitVideos} title={!canSubmitVideos && prerequisites ? nextRecommendedAction(prerequisites) : undefined}>Dry-run Submit Videos</button>
      <button disabled={!batch || disabled} onClick={() => batch && onRun("/api/video-batches/send-to-watermark", { batchId: batch.id, mock: true })}>Try Mock Watermark</button>
      <button disabled={!batch || disabled} onClick={() => batch && onRun("/api/video-batches/export-report", { batchId: batch.id })}>Export Report</button>
    </div>
  );
}
