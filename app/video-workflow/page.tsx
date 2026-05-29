"use client";

import { useState } from "react";
import { BatchCreator, BatchCreatorValues } from "@/components/video-workflow/BatchCreator";
import { ImagePreviewTable } from "@/components/video-workflow/ImagePreviewTable";
import { PrerequisiteChecklist } from "@/components/video-workflow/PrerequisiteChecklist";
import { PromptTable } from "@/components/video-workflow/PromptTable";
import { StatusBadge } from "@/components/video-workflow/StatusBadge";
import { WorkflowActions } from "@/components/video-workflow/WorkflowActions";
import { VideoBatch } from "@/lib/schemas/videoBatch.schema";

type ApiResult = {
  ok: boolean;
  batch?: VideoBatch;
  error?: string;
  errorCode?: string;
  message?: string;
  missingRequirements?: string[];
  finalReportPath?: string;
};

export default function VideoWorkflowPage() {
  const [batch, setBatch] = useState<VideoBatch | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function call(path: string, body: Record<string, unknown> = {}) {
    setBusy(true);
    setMessage("");
    const response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const data = await response.json() as ApiResult;
    if (data.batch) setBatch(data.batch);
    setMessage(data.ok
      ? `${path} complete${data.finalReportPath ? `\n${data.finalReportPath}` : ""}`
      : formatApiError(data));
    setBusy(false);
    return data;
  }

  async function create(values: BatchCreatorValues) {
    const created = await call("/api/video-batches/create", values);
    if (created.batch) {
      await call("/api/video-batches/generate-prompts", {
        batchId: created.batch.id,
        count: values.count,
        persona: values.persona,
        styleNotes: values.styleNotes
      });
    }
  }

  return (
    <main className="page">
      <div className="topbar">
        <div>
          <h1>AI Video Batch Workflow</h1>
          <p className="muted">Standalone app using VideoFactory as an external CLI provider. Default mode is dry-run/mock.</p>
        </div>
        {batch ? <StatusBadge value={batch.status} /> : null}
      </div>
      <div className="grid">
        <section className="panel">
          <h2>Create VideoBatch</h2>
          <BatchCreator disabled={busy} onCreate={create} />
          <PrerequisiteChecklist batch={batch} />
          <h2>Workflow Actions</h2>
          <WorkflowActions batch={batch} disabled={busy} onRun={call} onBlocked={setMessage} />
          {message ? <div className="notice">{message}</div> : null}
        </section>
        <section className="panel">
          <h2>{batch ? `${batch.title} (${batch.id})` : "Structured Prompts"}</h2>
          {batch ? <ImagePreviewTable items={batch.items} /> : null}
          <h2>Editable Prompt Fields</h2>
          <PromptTable items={batch?.items || []} />
        </section>
      </div>
    </main>
  );
}

function formatApiError(data: ApiResult): string {
  const base = data.message || data.error || "Request failed";
  const code = data.errorCode ? ` (${data.errorCode})` : "";
  const missing = data.missingRequirements?.length
    ? `\nMissing requirements:\n- ${data.missingRequirements.join("\n- ")}`
    : "";
  return `${base}${code}${missing}`;
}
