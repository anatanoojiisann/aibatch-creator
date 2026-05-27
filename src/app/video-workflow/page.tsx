"use client";

import { FormEvent, useState } from "react";
import Image from "next/image";
import type { VideoBatch } from "@/schemas/videoBatch.schema";

type ApiResult = {
  ok: boolean;
  batch?: VideoBatch;
  error?: string;
  [key: string]: unknown;
};

export default function VideoWorkflowPage() {
  const [batch, setBatch] = useState<VideoBatch | null>(null);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");

  async function call(path: string, body: Record<string, unknown>) {
    setBusy(path);
    setMessage("");
    const response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json() as ApiResult;
    if (data.batch) setBatch(data.batch);
    setMessage(data.ok ? `${path} complete` : data.error || "Request failed");
    setBusy("");
    return data;
  }

  async function createBatch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await call("/api/video-batches/create", {
      topic: form.get("topic"),
      platform: form.get("platform"),
      aspectRatio: form.get("aspectRatio"),
      persona: form.get("persona"),
      count: Number(form.get("count") || 10),
      styleNotes: form.get("styleNotes"),
    });
  }

  const approvedIds = batch?.items
    .filter((item) => item.referenceImage.status === "ready_for_preview")
    .map((item) => item.id) || [];

  return (
    <main className="workflow">
      <div className="topbar">
        <div>
          <h1>Video Workflow</h1>
          <div className="muted">Batch prompts, VideoFactory handoff, public images, video status, and watermark processing.</div>
        </div>
        {batch ? <span className="status">{batch.status}</span> : null}
      </div>

      <div className="grid">
        <section className="panel">
          <h2>Create VideoBatch</h2>
          <form onSubmit={createBatch}>
            <label className="field">
              <span>Topic</span>
              <input name="topic" required defaultValue="AI desk setup tips" />
            </label>
            <label className="field">
              <span>Platform</span>
              <select name="platform" defaultValue="tiktok">
                <option value="tiktok">TikTok</option>
                <option value="xiaohongshu">Xiaohongshu</option>
                <option value="youtube_shorts">YouTube Shorts</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label className="field">
              <span>Aspect ratio</span>
              <select name="aspectRatio" defaultValue="9:16">
                <option value="9:16">9:16</option>
                <option value="16:9">16:9</option>
                <option value="1:1">1:1</option>
              </select>
            </label>
            <label className="field">
              <span>Persona</span>
              <input name="persona" placeholder="Aiko or Aiko,Lune" />
            </label>
            <label className="field">
              <span>Count</span>
              <input name="count" type="number" min="1" max="50" defaultValue="10" />
            </label>
            <label className="field">
              <span>Style notes</span>
              <textarea name="styleNotes" rows={3} placeholder="Bright, clean, premium, fast hook" />
            </label>
            <button className="primary" disabled={Boolean(busy)}>Generate Structured Prompts</button>
          </form>

          <div className="actions">
            <button disabled={!batch || Boolean(busy)} onClick={() => batch && call("/api/video-batches/export", { batchId: batch.id })}>Export Prompt Dir</button>
            <button disabled={!batch || Boolean(busy)} onClick={() => batch && call("/api/video-batches/submit-images", { batchId: batch.id, remote: false, dryRun: true, limit: 1, modelLimit: 1 })}>Submit Images Dry Run</button>
            <button disabled={!batch || Boolean(busy)} onClick={() => batch && call("/api/video-batches/sync-images", { batchId: batch.id, mock: true })}>Sync Images Mock</button>
            <button disabled={!batch || approvedIds.length === 0 || Boolean(busy)} onClick={() => batch && call("/api/video-batches/import", { batchId: batch.id, approvedItemIds: approvedIds })}>Approve Ready Images</button>
            <button disabled={!batch || Boolean(busy)} onClick={() => batch && call("/api/video-batches/upload-public-images", { batchId: batch.id })}>Upload Public Images</button>
            <button disabled={!batch || Boolean(busy)} onClick={() => batch && call("/api/video-batches/submit-videos", { batchId: batch.id, remote: false, dryRun: true, limit: 1 })}>Submit Videos Dry Run</button>
            <button disabled={!batch || Boolean(busy)} onClick={() => batch && call("/api/video-batches/poll-video-status", { batchId: batch.id, mockSuccess: true })}>Mock Video Success</button>
            <button disabled={!batch || Boolean(busy)} onClick={() => batch && call("/api/video-batches/send-to-watermark", { batchId: batch.id, mode: "extra_fast", mock: true })}>Send To Watermark</button>
          </div>
          {message ? <div className="notice">{message}</div> : null}
        </section>

        <section className="panel">
          <h2>{batch ? batch.title : "Structured Prompts"}</h2>
          <div className="items">
            {batch?.items.map((item) => (
              <article className="item" key={item.id}>
                <div className="preview">
                  {item.referenceImage.previewUrl ? <Image alt="" src={item.referenceImage.previewUrl} fill sizes="96px" unoptimized /> : item.id}
                </div>
                <div>
                  <h3>{item.index}. {item.title}</h3>
                  <p>{item.referenceImagePrompt}</p>
                  <div className="chips">
                    <span className="chip">image: {item.referenceImage.status}</span>
                    <span className="chip">video: {item.generation.status}</span>
                    <span className="chip">watermark: {item.postProcessing.watermarkStatus}</span>
                    {item.persona ? <span className="chip">{item.persona}</span> : null}
                  </div>
                </div>
              </article>
            )) || <div className="muted">Create a batch to generate the first 10 structured items.</div>}
          </div>
        </section>
      </div>
    </main>
  );
}
