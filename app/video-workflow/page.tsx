"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BatchCreator, BatchCreatorValues } from "@/components/video-workflow/BatchCreator";
import { PromptTable } from "@/components/video-workflow/PromptTable";
import { StatusBadge } from "@/components/video-workflow/StatusBadge";
import { WorkflowActions } from "@/components/video-workflow/WorkflowActions";
import { getVideoWorkflowPrerequisites } from "@/lib/services/videoSubmissionGuard";
import { VideoBatch } from "@/lib/schemas/videoBatch.schema";
import { VideoCreativeItem } from "@/lib/schemas/videoCreativeItem.schema";
import type { ImageGenerationMode } from "@/lib/integrations/videofactory/videoFactoryTypes";
import { isRealMp4Url, isRealPublicHttpsUrl, mockVideoMessage, realPublicImageUrlMessage } from "@/lib/services/videoAssetValidation";
import { getProviderDefinition, getProviderRegistry } from "@/lib/providers/providerRegistry";
import type { ProviderDiagnostic } from "@/lib/providers/providerDiagnostics";
import type { ProviderId } from "@/lib/providers/providerTypes";

type VideoGenerationMode = "mock" | "real";
const providerRegistry = getProviderRegistry();

type ApiResult = {
  ok: boolean;
  batch?: VideoBatch;
  batches?: VideoBatch[];
  error?: string;
  errorCode?: string;
  message?: string;
  missingRequirements?: string[];
  finalReportPath?: string;
  resultPath?: string;
  result?: {
    stdout?: string;
    stderr?: string;
    command?: string;
  };
  commandLogs?: Array<{
    command: string;
    stdout: string;
    stderr: string;
  }>;
  runtimeDiagnostics?: {
    keyPresent: boolean;
    keyLength: number;
    keySha256Prefix: string;
    keyMasked: string;
    bridgeUrl: string;
    dryRun: boolean;
    videoFactoryPath: string;
    command?: string;
    envLocalExists: boolean;
    childProcessPixverseKeyPresent: boolean;
  };
};

type ProgressState = {
  promptPlan: boolean;
  promptDir: boolean;
  referenceImages: boolean;
  imageApproval: boolean;
  publicUrls: boolean;
  imageUrlMap: boolean;
  videos: boolean;
  watermark: boolean;
  report: boolean;
};

export default function VideoWorkflowPage() {
  const [batch, setBatch] = useState<VideoBatch | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [imageProgress, setImageProgress] = useState("");
  const [imageGenerationRunning, setImageGenerationRunning] = useState(false);
  const [imageMode, setImageMode] = useState<ImageGenerationMode>("mock");
  const [imageLimit, setImageLimit] = useState(1);
  const [imageModelLimit, setImageModelLimit] = useState(1);
  const [imageModels, setImageModels] = useState("");
  const [confirmRealRun, setConfirmRealRun] = useState(false);
  const [imageError, setImageError] = useState<ApiResult | null>(null);
  const [reportPath, setReportPath] = useState("");
  const [existingBatchId, setExistingBatchId] = useState("");
  const [videoMode, setVideoMode] = useState<VideoGenerationMode>("mock");
  const [confirmRealVideoRun, setConfirmRealVideoRun] = useState(false);
  const [manualPublicImageUrl, setManualPublicImageUrl] = useState("");
  const [providerId, setProviderId] = useState<ProviderId>("pixverse_official_api");
  const [providerDiagnostics, setProviderDiagnostics] = useState<ProviderDiagnostic[]>([]);
  const [confirmProviderUpload, setConfirmProviderUpload] = useState(false);

  useEffect(() => {
    void loadLatestBatch();
    void loadProviderDiagnostics();
  }, []);

  const progress = useMemo(() => batch ? getProgress(batch, reportPath) : null, [batch, reportPath]);
  const prerequisites = useMemo(() => batch ? getVideoWorkflowPrerequisites(batch) : null, [batch]);
  const nextAction = imageGenerationRunning
    ? "Generating reference images..."
    : batch && progress ? getNextAction(batch, progress) : "Next: create a batch and generate prompts.";
  const readyPreviewIds = batch?.items.filter((item) => item.referenceImage.status === "ready_for_preview").map((item) => item.id) || [];
  const uploadedItems = batch?.items.filter((item) => item.referenceImage.status === "uploaded_public" && item.referenceImage.publicUrl) || [];
  const hasSelectedProviderAsset = Boolean(batch?.items.some((item) =>
    item.referenceImage.providerAssets?.some((asset) => asset.providerId === providerId && Boolean(asset.providerAssetId))));
  const videoItems = batch?.items.filter((item) => item.generation.status === "video_succeeded") || [];
  const canSyncRealVideosAgain = Boolean(batch?.items.some((item) =>
    item.generation.status === "waiting_for_real_video_output"
    || item.generation.status === "video_submitted"
        || item.generation.status === "video_generating"));
  const selectedProvider = getProviderDefinition(providerId);
  const selectedProviderDiagnostic = providerDiagnostics.find((entry) => entry.id === providerId);
  const selectedProviderConfigReady = selectedProvider.source === "official_api"
    && selectedProviderDiagnostic?.credentialStatus === "configured"
    && selectedProviderDiagnostic.baseUrlConfigured;
  const canSyncRealImagesAgain = Boolean(imageMode === "real"
    && batch?.items.some((item) =>
      !item.referenceImage.localPath
      && (item.referenceImage.status === "waiting_for_real_output"
        || item.referenceImage.errorCode === "NO_REAL_IMAGE_OUTPUT_FOUND"
        || item.referenceImage.errorCode === "WAITING_FOR_REAL_IMAGE_OUTPUT")));

  async function reloadBatch(batchId: string) {
    const response = await fetch(`/api/video-batches/create?batchId=${encodeURIComponent(batchId)}`);
    const data = await response.json() as ApiResult;
    if (data.batch) {
      setBatch(data.batch);
      setExistingBatchId(data.batch.id);
      setProviderId(data.batch.providerSetup?.selectedProviderId || "pixverse_official_api");
    }
    return data.batch;
  }

  async function loadLatestBatch() {
    try {
      const response = await fetch("/api/video-batches/create");
      const data = await response.json() as ApiResult;
      const latest = data.batches?.[0];
      if (latest) {
        setBatch(latest);
        setExistingBatchId(latest.id);
        setProviderId(latest.providerSetup?.selectedProviderId || "pixverse_official_api");
      }
    } catch {
      // Creating a new batch remains available if no saved batch can be loaded.
    }
  }

  async function loadProviderDiagnostics() {
    const response = await fetch("/api/provider-diagnostics");
    const data = await response.json() as { providers?: ProviderDiagnostic[] };
    setProviderDiagnostics(data.providers || []);
  }

  async function loadExistingBatch() {
    const batchId = existingBatchId.trim();
    if (!batchId) return;
    setBusy(true);
    setMessage("");
    try {
      const loaded = await reloadBatch(batchId);
      setMessage(loaded ? `Loaded ${loaded.id}` : `Batch not found: ${batchId}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load batch.");
    } finally {
      setBusy(false);
    }
  }

  async function call(path: string, body: Record<string, unknown> = {}) {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const data = await response.json() as ApiResult;
      const batchId = data.batch?.id || String(body.batchId || "");
      if (data.batch) setBatch(data.batch);
      if (data.finalReportPath) setReportPath(data.finalReportPath);
      if (batchId) await reloadBatch(batchId);
      setMessage(data.ok
        ? `${labelFor(path)} complete${data.finalReportPath ? `\n${data.finalReportPath}` : ""}`
        : formatApiError(data));
      return data;
    } catch (error) {
      const text = error instanceof Error ? error.message : "Unknown error";
      setMessage(text);
      return { ok: false, error: text } satisfies ApiResult;
    } finally {
      setBusy(false);
    }
  }

  async function create(values: BatchCreatorValues) {
    setReportPath("");
    setImageProgress("");
    setImageError(null);
    await call("/api/video-batches/create", { ...values, providerId });
  }

  async function selectProvider(nextProviderId: ProviderId) {
    setProviderId(nextProviderId);
    if (batch) await call("/api/video-batches/provider", { batchId: batch.id, providerId: nextProviderId });
  }

  async function generateReferenceImages() {
    if (!batch) return;
    setImageGenerationRunning(true);
    setImageError(null);
    setImageProgress(progressTextForMode(imageMode));
    const progressTimers = imageMode === "real"
      ? [
        window.setTimeout(() => setImageProgress("Syncing generated images..."), 2500),
        window.setTimeout(() => setImageProgress("Importing generated images..."), 6000)
      ]
      : [];
    try {
      const result = await call("/api/video-batches/generate-reference-images", {
        batchId: batch.id,
        mode: imageMode,
        limit: imageLimit,
        modelLimit: imageModelLimit,
        models: imageModels.split(",").map((model) => model.trim()).filter(Boolean),
        confirmRealRun
      });
      if (result.ok) {
        if (imageMode === "dry-run") {
          setImageProgress("VideoFactory dry-run completed. No real remote jobs were created.");
        } else {
          setImageProgress(result.message || "Reference image ready for preview.");
        }
      } else {
        setImageError(result);
        setImageProgress("Reference image generation failed.");
      }
    } finally {
      progressTimers.forEach((timer) => window.clearTimeout(timer));
      setImageGenerationRunning(false);
    }
  }

  async function syncRealImagesAgain() {
    if (!batch) return;
    setImageGenerationRunning(true);
    setImageError(null);
    setImageProgress("Syncing real image output again...");
    try {
      const result = await call("/api/video-batches/sync-real-images", { batchId: batch.id });
      if (result.ok) {
        setImageProgress(result.message || "Real image sync complete.");
      } else {
        setImageError(result);
        setImageProgress(result.message || "Real image sync failed.");
      }
    } finally {
      setImageGenerationRunning(false);
    }
  }

  async function approveAndUpload(ids: string[]) {
    if (!batch || ids.length === 0) return;
    await call("/api/video-batches/upload-public-images", { batchId: batch.id, approvedItemIds: ids });
  }

  async function applyManualPublicImageUrl() {
    if (!batch || !manualPublicImageUrl.trim()) return;
    await call("/api/video-batches/generate-image-url-map", {
      batchId: batch.id,
      publicImageUrlOverrides: { item_001: manualPublicImageUrl.trim() }
    });
  }

  async function uploadFirstImageToProvider() {
    if (!batch) return;
    const item = batch.items.find((entry) => entry.referenceImage.localPath && ["ready_for_preview", "approved", "uploaded_public"].includes(entry.referenceImage.status));
    if (!item) return;
    const result = await call("/api/video-batches/upload-provider-image", {
      batchId: batch.id,
      itemId: item.id,
      providerId,
      confirmRealUpload: confirmProviderUpload
    });
    if (result.ok) setConfirmProviderUpload(false);
  }

  async function rejectImage(id: string) {
    if (!batch) return;
    await call("/api/video-batches/upload-public-images", { batchId: batch.id, rejectedItemIds: [id] });
  }

  async function generateVideos() {
    if (!batch) return;
    if (videoMode === "real") {
      await call("/api/video-batches/submit-videos", {
        batchId: batch.id,
        mode: videoMode,
        providerId,
        confirmRealRun: confirmRealVideoRun
      });
      return;
    }
    const overrides = manualPublicImageUrl.trim()
      ? { item_001: manualPublicImageUrl.trim() }
      : {};
    const mapped = await call("/api/video-batches/generate-image-url-map", {
      batchId: batch.id,
      publicImageUrlOverrides: overrides
    });
    if (mapped.ok) {
      await call("/api/video-batches/submit-videos", {
        batchId: batch.id,
        mode: videoMode,
        providerId,
        confirmRealRun: false
      });
    }
  }

  async function syncRealVideosAgain() {
    if (!batch) return;
    await call("/api/video-batches/sync-real-videos", { batchId: batch.id });
  }

  async function copyText(value: string) {
    await navigator.clipboard.writeText(value);
    setMessage("Copied URL.");
  }

  return (
    <main className="page">
      <div className="topbar">
        <div>
          <h1>AI Video Batch Workflow</h1>
          <p className="muted">Create prompts, generate mock reference images, approve them, create videos, watermark, and export a report.</p>
        </div>
        {batch ? <StatusBadge value={batch.status} /> : null}
      </div>

      <div className="workflow-layout">
        <aside className="panel sidebar">
          <h2>Step 1 - Prompt Plan</h2>
          <BatchCreator disabled={busy} onCreate={create} />
          <div className="existing-batch-loader">
            <label className="field">
              <span>Existing batch ID</span>
              <input value={existingBatchId} onChange={(event) => setExistingBatchId(event.target.value)} placeholder="batch_..." />
            </label>
            <button disabled={busy || !existingBatchId.trim()} onClick={loadExistingBatch}>Load Existing Batch</button>
          </div>
          <WorkflowProgress progress={progress} />
          <div className="next-action">{nextAction}</div>
          <Link href="/provider-diagnostics">Provider diagnostics</Link>
          <Link href="/provider-settings">Provider settings</Link>
          <Link href="/web-api-capture">Web API capture</Link>
          {message ? <div className="notice" role="status">{message}</div> : null}
        </aside>

        <section className="flow">
          <StepCard step="0" title="Provider Setup" done={Boolean(providerId)}>
            <ProviderSetupPanel
              providerId={providerId}
              diagnostic={selectedProviderDiagnostic}
              disabled={busy}
              onProvider={selectProvider}
            />
          </StepCard>
          <StepCard step="1" title="Prompt Plan" done={Boolean(progress?.promptPlan)}>
            <p className="muted">Review and edit the generated structured prompts before handing them to VideoFactory.</p>
            <button className="primary" disabled={!batch || busy || !progress?.promptPlan} onClick={() => batch && call("/api/video-batches/export-prompt-dir", { batchId: batch.id })}>
              Export Prompt Dir
            </button>
            <PromptPlanSummary batch={batch} />
            <details className="prompt-editor" open={Boolean(batch && !batch.videoFactory.promptDir)}>
              <summary>Edit prompts</summary>
              <PromptTable items={batch?.items || []} />
            </details>
          </StepCard>

          <StepCard step="2" title="Reference Images" done={Boolean(progress?.referenceImages)}>
            <p className="muted">Reference images currently use the isolated legacy VideoFactory bridge. They are marked separately and are not silently treated as {selectedProvider.label} assets.</p>
            <ReferenceImageModeControls
              mode={imageMode}
              limit={imageLimit}
              modelLimit={imageModelLimit}
              models={imageModels}
              confirmRealRun={confirmRealRun}
              disabled={busy}
              onMode={setImageMode}
              onLimit={setImageLimit}
              onModelLimit={setImageModelLimit}
              onModels={setImageModels}
              onConfirmRealRun={setConfirmRealRun}
            />
            <div className="actions">
              <button className="primary" disabled={!batch || busy || !progress?.promptDir || realModeBlocked(imageMode, imageLimit, imageModelLimit, confirmRealRun)} onClick={generateReferenceImages}>
                {imageGenerationRunning ? "Generating reference images..." : "Generate Reference Images"}
              </button>
              {canSyncRealImagesAgain ? (
                <button disabled={!batch || busy} onClick={syncRealImagesAgain}>
                  Sync Real Images Again
                </button>
              ) : null}
            </div>
            <ImageGenerationProgress batch={batch} imageProgress={imageProgress} busy={imageGenerationRunning} />
            {imageError ? <ApiErrorPanel error={imageError} /> : null}
            <ReferenceImageGenerationGrid items={batch?.items || []} isGenerating={imageGenerationRunning} />
          </StepCard>

          <StepCard step="3" title="Image Review" done={Boolean(progress?.publicUrls)}>
            <p className="muted">Mock upload remains available for dry-run testing. Official API video generation uses a provider-scoped uploaded image asset.</p>
            <div className="actions">
              <button className="primary" disabled={!batch || busy || readyPreviewIds.length === 0} onClick={() => approveAndUpload(readyPreviewIds.slice(0, 1))}>
                Approve First Image + Mock Upload
              </button>
              <button disabled={!batch || busy || readyPreviewIds.length === 0} onClick={() => approveAndUpload(readyPreviewIds)}>
                Approve All + Mock Upload
              </button>
            </div>
            <div className="mode-panel">
              <label className="field">
                <span>Manual public HTTPS image URL for item_001</span>
                <input placeholder="https://cdn.example.net/item_001.jpg" value={manualPublicImageUrl} onChange={(event) => setManualPublicImageUrl(event.target.value)} />
              </label>
              <button disabled={!batch || busy || !manualPublicImageUrl.trim()} onClick={applyManualPublicImageUrl}>Use Manual Public Image URL</button>
              {manualPublicImageUrl && !isRealPublicHttpsUrl(manualPublicImageUrl) ? <p className="error-box">{realPublicImageUrlMessage}</p> : null}
            </div>
            {selectedProvider.capabilities.includes("upload_image") ? (
              <div className="warning-panel">
                <strong>Upload one approved local image to {selectedProvider.label}.</strong>
                <p className="muted">This is a real provider upload. The returned asset ID is stored only under {selectedProvider.id} and cannot be reused by Pai.</p>
                <label className="check-field">
                  <input disabled={busy} checked={confirmProviderUpload} type="checkbox" onChange={(event) => setConfirmProviderUpload(event.target.checked)} />
                  <span>I understand this will upload one real image to the selected provider.</span>
                </label>
                <button disabled={!batch || busy || !selectedProviderConfigReady || !confirmProviderUpload || !batch.items.some((item) => item.referenceImage.localPath && ["ready_for_preview", "approved", "uploaded_public"].includes(item.referenceImage.status))} onClick={uploadFirstImageToProvider}>
                  Upload First Image to {selectedProvider.label}
                </button>
              </div>
            ) : null}
            <ImageReviewGrid items={batch?.items || []} busy={busy} onApprove={(id) => approveAndUpload([id])} onReject={rejectImage} />
          </StepCard>

          <StepCard step="4" title="Video Generation" done={Boolean(progress?.videos)}>
            <p className="muted">Choose a mock VideoFactory dry-run or submit one explicitly confirmed real image-to-video job.</p>
            <VideoModeControls mode={videoMode} disabled={busy} confirmRealRun={confirmRealVideoRun} onMode={setVideoMode} onConfirmRealRun={setConfirmRealVideoRun} />
            {videoMode === "real" ? <p className="provider-note">Real mode uses {selectedProvider.label} only. There is no silent VideoFactory fallback.</p> : null}
            <div className="actions">
              <button className="primary" disabled={!batch || busy || !prerequisites?.promptDirExported || (videoMode === "real" ? !selectedProviderConfigReady || !confirmRealVideoRun || !hasSelectedProviderAsset : uploadedItems.length === 0 && !manualPublicImageUrl.trim())} onClick={generateVideos}>
                {videoMode === "real" ? `Submit Real ${selectedProvider.label} Image-to-Video` : "Generate Mock / Dry-run Video"}
              </button>
              {canSyncRealVideosAgain ? <button disabled={!batch || busy} onClick={syncRealVideosAgain}>Sync Real Videos Again</button> : null}
            </div>
            <VideoResultList items={batch?.items || []} busy={busy} onCopy={copyText} onWatermark={() => batch && call("/api/video-batches/send-to-watermark", { batchId: batch.id, mock: true })} />
          </StepCard>

          <StepCard step="5" title="Watermark & Report" done={Boolean(progress?.watermark && progress.report)}>
            <div className="actions">
              <button className="primary" disabled={!batch || busy || videoItems.length === 0} onClick={() => batch && call("/api/video-batches/send-to-watermark", { batchId: batch.id, mock: true })}>
                Send Successful Videos to Watermark
              </button>
              <button className="primary" disabled={!batch || busy || !progress?.watermark} onClick={() => batch && call("/api/video-batches/export-report", { batchId: batch.id })}>
                Export Final Report
              </button>
            </div>
            <OutputSummary items={batch?.items || []} reportPath={reportPath} />
          </StepCard>

          <details className="panel advanced">
            <summary>Advanced Debug</summary>
            <WorkflowActions batch={batch} disabled={busy} onRun={call} onBlocked={setMessage} />
          </details>
        </section>
      </div>
    </main>
  );
}

function WorkflowProgress({ progress }: { progress: ProgressState | null }) {
  const rows = [
    ["Prompt plan", progress?.promptPlan],
    ["Prompt dir", progress?.promptDir],
    ["Reference images", progress?.referenceImages],
    ["Image approval", progress?.imageApproval],
    ["Public URLs", progress?.publicUrls],
    ["Image URL map", progress?.imageUrlMap],
    ["Videos", progress?.videos],
    ["Watermark", progress?.watermark],
    ["Report", progress?.report]
  ] as const;
  return (
    <div className="progress-list">
      {rows.map(([label, done]) => (
        <div className={done ? "progress-row done" : "progress-row"} key={label}>
          <span>{done ? "done" : "pending"}</span>
          {label}
        </div>
      ))}
    </div>
  );
}

function StepCard({ step, title, done, children }: { step: string; title: string; done: boolean; children: React.ReactNode }) {
  return (
    <article className="step-card">
      <div className="step-header">
        <div>
          <span className="step-kicker">Step {step}</span>
          <h2>{title}</h2>
        </div>
        <StatusBadge value={done ? "done" : "pending"} />
      </div>
      {children}
    </article>
  );
}

function PromptPlanSummary({ batch }: { batch: VideoBatch | null }) {
  if (!batch) return <p className="muted">No prompt plan yet.</p>;
  return (
    <div className="summary-grid">
      <div>
        <strong>{batch.items.length}</strong>
        <span>prompts</span>
      </div>
      <div>
        <strong>{batch.videoFactory.promptDir ? "done" : "pending"}</strong>
        <span>prompt-dir status</span>
      </div>
      <div className="wide">
        <strong>{batch.videoFactory.promptDir || "Prompt dir not exported yet"}</strong>
        <span>prompt-dir path</span>
      </div>
    </div>
  );
}

function ProviderSetupPanel({ providerId, diagnostic, disabled, onProvider }: {
  providerId: ProviderId;
  diagnostic?: ProviderDiagnostic;
  disabled: boolean;
  onProvider: (providerId: ProviderId) => void;
}) {
  const provider = getProviderDefinition(providerId);
  return (
    <div>
      <div className="provider-warning">
        PixVerse and Pai use separate accounts and separate credits. Selecting Pai will not use PixVerse API keys or PixVerse balance.
      </div>
      <label className="field">
        <span>Provider</span>
        <select disabled={disabled} value={providerId} onChange={(event) => onProvider(event.target.value as ProviderId)}>
          <optgroup label="PixVerse">
            {providerRegistry.filter((entry) => entry.group === "pixverse").map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}
          </optgroup>
          <optgroup label="Pai">
            {providerRegistry.filter((entry) => entry.group === "pai").map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}
          </optgroup>
          <optgroup label="Custom">
            {providerRegistry.filter((entry) => entry.group === "custom").map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}
          </optgroup>
        </select>
      </label>
      <div className="provider-facts">
        <p><strong>Provider ID:</strong> {provider.id}</p>
        <p><strong>Platform group:</strong> {provider.group}</p>
        <p><strong>Source type:</strong> {provider.source === "official_api" ? "official API" : "web"}</p>
        <p><strong>Account scope:</strong> {provider.accountScope}</p>
        <p><strong>Credential status:</strong> {diagnostic?.credentialStatus || "loading"}</p>
        <p><strong>Base URL:</strong> {diagnostic?.baseUrlConfigured ? diagnostic.baseUrl : "not configured"}</p>
        <p><strong>Balance status:</strong> {diagnostic?.balanceStatus || "loading"}</p>
        <p><strong>Capabilities:</strong> {provider.capabilities.length > 0 ? provider.capabilities.join(", ") : "none enabled"}</p>
        <p><strong>Endpoint manifest:</strong> {diagnostic?.observedEndpointCount ?? provider.endpointManifest.length} entries</p>
        {diagnostic?.credentials.map((credential) => (
          <p key={credential.envKey}><strong>{credential.envKey} fingerprint:</strong> {credential.present ? `${credential.masked} / ${credential.sha256Prefix}` : "not configured"}</p>
        ))}
        {provider.experimental ? <p className="error-box">Experimental web mode: manual HAR analysis only. Automatic web actions are disabled. {diagnostic?.observedEndpointCount ? `${diagnostic.observedEndpointCount} observed endpoints.` : "HAR capture pending."}</p> : null}
        {provider.source === "official_api" && diagnostic?.credentialStatus !== "configured" ? (
          <p className="error-box">Provider config missing. Real actions are disabled. <Link href="/provider-settings">Configure provider in Provider Settings</Link>.</p>
        ) : null}
        {provider.source === "web" ? <p><Link href="/web-api-capture">Open Web API Capture</Link></p> : null}
        {provider.limitations.map((limitation) => <p className="muted" key={limitation}>{limitation}</p>)}
      </div>
    </div>
  );
}

function ReferenceImageModeControls({
  mode,
  limit,
  modelLimit,
  models,
  confirmRealRun,
  disabled,
  onMode,
  onLimit,
  onModelLimit,
  onModels,
  onConfirmRealRun
}: {
  mode: ImageGenerationMode;
  limit: number;
  modelLimit: number;
  models: string;
  confirmRealRun: boolean;
  disabled: boolean;
  onMode: (mode: ImageGenerationMode) => void;
  onLimit: (value: number) => void;
  onModelLimit: (value: number) => void;
  onModels: (value: string) => void;
  onConfirmRealRun: (value: boolean) => void;
}) {
  return (
    <div className="mode-panel">
      <div className="field">
        <span>Image generation mode</span>
        <select disabled={disabled} value={mode} onChange={(event) => onMode(event.target.value as ImageGenerationMode)}>
          <option value="mock">Mock</option>
          <option value="dry-run">VideoFactory Dry-run</option>
          <option value="real">Real VideoFactory Remote</option>
        </select>
      </div>
      <div className="mini-grid">
        <label className="field">
          <span>limit</span>
          <input disabled={disabled} min={1} max={10} type="number" value={limit} onChange={(event) => onLimit(Number(event.target.value || 1))} />
        </label>
        <label className="field">
          <span>modelLimit</span>
          <input disabled={disabled} min={1} max={10} type="number" value={modelLimit} onChange={(event) => onModelLimit(Number(event.target.value || 1))} />
        </label>
      </div>
      <label className="field">
        <span>optional models</span>
        <input disabled={disabled} placeholder="qwen-image, seedream-4.0" value={models} onChange={(event) => onModels(event.target.value)} />
      </label>
      {mode === "real" ? (
        <div className="warning-panel">
          <strong>This will call the Aurax PixVerse bridge through local VideoFactory and may consume credits.</strong>
          <label className="check-field">
            <input disabled={disabled} checked={confirmRealRun} type="checkbox" onChange={(event) => onConfirmRealRun(event.target.checked)} />
            <span>I understand this may consume credits.</span>
          </label>
          {(limit > 1 || modelLimit > 1) ? <p className="error-box">First real integration is locked to limit=1 and modelLimit=1.</p> : null}
        </div>
      ) : null}
    </div>
  );
}

function ImageGenerationProgress({ batch, imageProgress, busy }: {
  batch: VideoBatch | null;
  imageProgress: string;
  busy: boolean;
}) {
  const outputDir = batch?.videoFactory.outputDir;
  const waitingMessage = batch?.items.find((item) => item.referenceImage.status === "waiting_for_real_output")?.referenceImage.errorMessage;
  const status = imageProgress || waitingMessage || (batch?.items.some((item) => item.referenceImage.status === "ready_for_preview") ? "Reference images ready for preview." : "Reference images pending.");
  return (
    <div className={busy && imageProgress ? "image-progress active" : "image-progress"}>
      <strong>{status}</strong>
      <span>{busy && imageProgress ? "Generating..." : "Current image generation state"}</span>
      {outputDir ? <p className="url-text">Output folder: {outputDir}</p> : null}
    </div>
  );
}

function ApiErrorPanel({ error }: { error: ApiResult }) {
  const logs = error.commandLogs || [];
  return (
    <div className="api-error-panel" role="alert">
      <strong>{error.errorCode || "REQUEST_FAILED"}</strong>
      <p>{error.message || error.error || "Reference image generation failed."}</p>
      {error.missingRequirements?.length ? (
        <ul>
          {error.missingRequirements.map((requirement) => <li key={requirement}>{requirement}</li>)}
        </ul>
      ) : null}
      {error.runtimeDiagnostics ? (
        <details>
          <summary>Safe runtime diagnostics</summary>
          <pre>{JSON.stringify(error.runtimeDiagnostics, null, 2)}</pre>
        </details>
      ) : null}
      {logs.map((log, index) => (
        <details key={`${log.command}-${index}`}>
          <summary>{log.command}</summary>
          {log.stdout ? <pre>{log.stdout}</pre> : null}
          {log.stderr ? <pre>{log.stderr}</pre> : null}
        </details>
      ))}
    </div>
  );
}

function ReferenceImageGenerationGrid({ items, isGenerating }: {
  items: VideoCreativeItem[];
  isGenerating: boolean;
}) {
  if (items.length === 0) return <p className="muted">Create prompts before generating reference images.</p>;
  return (
    <div className="review-grid reference-grid">
      {items.map((item) => {
        const effectiveStatus = imageDisplayStatus(item, isGenerating);
        return (
          <article className={`review-card image-state-${effectiveStatus}`} key={item.id}>
            <div className="review-preview">
              {item.referenceImage.previewUrl ? <img alt={`${item.id} preview`} src={item.referenceImage.previewUrl} /> : <span>{isGenerating ? "Generating..." : "No reference image yet"}</span>}
            </div>
            <h3>{item.id}</h3>
            <p>{item.title}</p>
            <StatusBadge value={`image: ${effectiveStatus}`} />
            {item.referenceImage.localPath ? <p className="url-text">localPath: {item.referenceImage.localPath}</p> : null}
            {item.referenceImage.previewUrl ? <p className="url-text">previewUrl: {item.referenceImage.previewUrl}</p> : null}
            {item.referenceImage.errorMessage ? <p className="error-box">{item.referenceImage.errorMessage}</p> : null}
          </article>
        );
      })}
    </div>
  );
}

function imageDisplayStatus(item: VideoCreativeItem, isGenerating: boolean): string {
  if (item.referenceImage.status === "failed") return "failed";
  if (item.referenceImage.status === "ready_for_preview" || item.referenceImage.status === "uploaded_public") return item.referenceImage.status;
  if (isGenerating && item.referenceImage.status === "submitted") return "syncing";
  if (isGenerating && item.referenceImage.status === "missing") return "submitting";
  return item.referenceImage.status;
}

function ImageReviewGrid({ items, busy, onApprove, onReject }: {
  items: VideoCreativeItem[];
  busy: boolean;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}) {
  return (
    <div className="review-grid">
      {items.map((item) => (
        <article className="review-card" key={item.id}>
          <div className="review-preview">
            {item.referenceImage.previewUrl ? <img alt={`${item.id} preview`} src={item.referenceImage.previewUrl} /> : <span>{item.id}</span>}
          </div>
          <h3>{item.id}</h3>
          <p>{item.title}</p>
          <StatusBadge value={item.referenceImage.status} />
          {item.referenceImage.publicUrl ? <p className="url-text">{item.referenceImage.publicUrl}</p> : null}
          <div className="actions">
            <button disabled={busy || item.referenceImage.status !== "ready_for_preview"} onClick={() => onApprove(item.id)}>Approve</button>
            <button disabled={busy || item.referenceImage.status !== "ready_for_preview"} onClick={() => onReject(item.id)}>Reject</button>
            <button disabled>Regenerate</button>
          </div>
        </article>
      ))}
    </div>
  );
}

function VideoModeControls({ mode, disabled, confirmRealRun, onMode, onConfirmRealRun }: {
  mode: VideoGenerationMode;
  disabled: boolean;
  confirmRealRun: boolean;
  onMode: (mode: VideoGenerationMode) => void;
  onConfirmRealRun: (value: boolean) => void;
}) {
  return (
    <div className="mode-panel">
      <label className="field">
        <span>Video generation mode</span>
        <select disabled={disabled} value={mode} onChange={(event) => onMode(event.target.value as VideoGenerationMode)}>
          <option value="mock">Mock / Dry-run Video</option>
          <option value="real">Real VideoFactory Image-to-Video</option>
        </select>
      </label>
      {mode === "real" ? (
        <div className="warning-panel">
          <strong>This submits one real provider image-to-video job and may consume credits.</strong>
          <label className="check-field">
            <input disabled={disabled} checked={confirmRealRun} type="checkbox" onChange={(event) => onConfirmRealRun(event.target.checked)} />
            <span>I understand this will submit one real video job.</span>
          </label>
        </div>
      ) : null}
    </div>
  );
}

function VideoResultList({ items, busy, onCopy, onWatermark }: {
  items: VideoCreativeItem[];
  busy: boolean;
  onCopy: (url: string) => void;
  onWatermark: () => void;
}) {
  const videos = items.filter((item) =>
    item.generation.videoUrl
    || item.generation.status === "waiting_for_real_video_output"
    || item.generation.status === "video_failed");
  if (videos.length === 0) return <p className="muted">No video results yet.</p>;
  return (
    <div className="result-list">
      {videos.map((item) => (
        <article className="result-card" key={item.id}>
          <h3>{item.id}</h3>
          <StatusBadge value={item.generation.status} />
          {item.generation.status === "video_succeeded" && (item.generation.previewUrl || isRealMp4Url(item.generation.videoUrl)) ? (
            <video controls preload="metadata" src={item.generation.previewUrl || item.generation.videoUrl} />
          ) : null}
          {item.generation.videoUrl ? <p className="url-text">{item.generation.videoUrl}</p> : null}
          {item.generation.videoJobId ? <p className="url-text">task ID: {item.generation.videoJobId}</p> : null}
          {item.generation.lastSyncAt ? <p className="url-text">last sync: {item.generation.lastSyncAt}</p> : null}
          {typeof item.generation.syncAttempts === "number" ? <p className="url-text">sync attempts: {item.generation.syncAttempts}</p> : null}
          {item.generation.errorMessage ? <p className="error-box">{item.generation.errorMessage}</p> : null}
          {item.generation.status === "video_mocked" && !item.generation.errorMessage ? <p className="error-box">{mockVideoMessage}</p> : null}
          <div className="actions">
            <button disabled={!item.generation.videoUrl} onClick={() => item.generation.videoUrl && onCopy(item.generation.videoUrl)}>Copy video URL</button>
            <button disabled={busy || item.generation.status !== "video_succeeded"} onClick={onWatermark}>Send to watermark</button>
          </div>
        </article>
      ))}
    </div>
  );
}

function OutputSummary({ items, reportPath }: { items: VideoCreativeItem[]; reportPath: string }) {
  const processed = items.filter((item) => item.postProcessing.processedVideoUrl);
  return (
    <div className="result-list">
      {processed.length === 0 ? <p className="muted">No processed videos yet.</p> : processed.map((item) => (
        <article className="result-card" key={item.id}>
          <h3>{item.id}</h3>
          <StatusBadge value={item.postProcessing.watermarkStatus} />
          <p className="url-text">{item.postProcessing.processedVideoUrl}</p>
        </article>
      ))}
      {reportPath ? <div className="report-path">Final report: {reportPath}</div> : null}
    </div>
  );
}

function getProgress(batch: VideoBatch, reportPath: string): ProgressState {
  const prereqs = getVideoWorkflowPrerequisites(batch);
  const videos = batch.items.some((item) => item.generation.status === "video_succeeded");
  const watermark = batch.items.some((item) => item.postProcessing.watermarkStatus === "done" && Boolean(item.postProcessing.processedVideoUrl));
  return {
    promptPlan: batch.items.length > 0,
    promptDir: prereqs.promptDirExported,
    referenceImages: prereqs.imagesSynced,
    imageApproval: prereqs.atLeastOneImageApproved,
    publicUrls: prereqs.publicImageUrlGenerated,
    imageUrlMap: prereqs.imageUrlMapGenerated,
    videos,
    watermark,
    report: Boolean(reportPath)
  };
}

function getNextAction(batch: VideoBatch, progress: ProgressState): string {
  if (!progress.promptPlan) return "Next: generate structured prompts.";
  if (!progress.promptDir) return "Next: export prompt-dir.";
  if (!progress.referenceImages && batch.items.some((item) => item.referenceImage.status === "waiting_for_real_output")) return "Next: Sync Real Images Again in 30–60 seconds.";
  if (!progress.referenceImages) return "Next: generate reference images.";
  if (!progress.publicUrls) return "Next: review and approve images.";
  if (batch.items.some((item) => item.generation.status === "waiting_for_real_video_output")) return "Next: Sync Real Videos Again in 30–60 seconds.";
  if (!progress.videos) return "Next: generate videos from approved images.";
  if (!progress.watermark) return "Next: send successful videos to watermark.";
  if (!progress.report) return "Next: export final report.";
  if (batch.status === "completed") return "Workflow completed.";
  return "Workflow completed.";
}

function progressTextForMode(mode: ImageGenerationMode): string {
  if (mode === "real") return "Submitting real image job through VideoFactory...";
  if (mode === "dry-run") return "Running VideoFactory submit-images dry-run...";
  return "Generating mock reference images...";
}

function realModeBlocked(mode: ImageGenerationMode, limit: number, modelLimit: number, confirmRealRun: boolean): boolean {
  if (mode !== "real") return false;
  return !confirmRealRun || limit > 1 || modelLimit > 1;
}

function labelFor(path: string): string {
  return path.split("/").filter(Boolean).at(-1)?.replaceAll("-", " ") || "Action";
}

function formatApiError(data: ApiResult): string {
  const base = data.message || data.error || "Request failed";
  const code = data.errorCode ? ` (${data.errorCode})` : "";
  const missing = data.missingRequirements?.length
    ? `\nMissing requirements:\n- ${data.missingRequirements.join("\n- ")}`
    : "";
  const raw = data.result?.stderr || data.result?.stdout
    ? `\n\nCommand output:\n${data.result.stderr || data.result.stdout}`
    : "";
  const logs = data.commandLogs?.length
    ? `\n\nCommand logs:\n${data.commandLogs.map((log) => `${log.command}\n${log.stderr || log.stdout || ""}`).join("\n\n")}`
    : "";
  return `${base}${code}${missing}${raw}${logs}`;
}
