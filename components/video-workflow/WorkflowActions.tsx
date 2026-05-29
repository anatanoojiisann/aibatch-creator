"use client";

import { VideoBatch } from "@/lib/schemas/videoBatch.schema";

export function WorkflowActions({ batch, disabled, onRun }: {
  batch: VideoBatch | null;
  disabled?: boolean;
  onRun: (path: string, body?: Record<string, unknown>) => void;
}) {
  const readyIds = batch?.items.filter((item) => item.referenceImage.status === "ready_for_preview").map((item) => item.id) || [];
  return (
    <div className="actions">
      <button disabled={!batch || disabled} onClick={() => batch && onRun("/api/video-batches/export-prompt-dir", { batchId: batch.id })}>Export Prompt Dir</button>
      <button disabled={!batch || disabled} onClick={() => batch && onRun("/api/video-batches/submit-images", { batchId: batch.id, dryRun: true, limit: 1 })}>Dry-run Submit Images</button>
      <button disabled={!batch || disabled} onClick={() => batch && onRun("/api/video-batches/sync-images", { batchId: batch.id, mock: true })}>Mock Sync Images</button>
      <button disabled={!batch || disabled || readyIds.length === 0} onClick={() => batch && onRun("/api/video-batches/upload-public-images", { batchId: batch.id, approvedItemIds: readyIds.slice(0, 1) })}>Approve 1 + Mock Upload</button>
      <button disabled={!batch || disabled} onClick={() => batch && onRun("/api/video-batches/generate-image-url-map", { batchId: batch.id })}>Generate Image URL Map</button>
      <button disabled={!batch || disabled} onClick={() => batch && onRun("/api/video-batches/submit-videos", { batchId: batch.id, dryRun: true, limit: 1 })}>Dry-run Submit Videos</button>
      <button disabled={!batch || disabled} onClick={() => batch && onRun("/api/video-batches/send-to-watermark", { batchId: batch.id, mock: true, mockSuccess: true })}>Mock Watermark</button>
      <button disabled={!batch || disabled} onClick={() => batch && onRun("/api/video-batches/export-report", { batchId: batch.id })}>Export Report</button>
    </div>
  );
}
