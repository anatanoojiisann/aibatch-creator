"use client";

import { VideoCreativeItem } from "@/lib/schemas/videoCreativeItem.schema";

export function PromptTable({ items }: { items: VideoCreativeItem[] }) {
  if (items.length === 0) return <p className="muted">Create a batch to generate 10 structured prompt items.</p>;
  return (
    <div className="table">
      {items.map((item) => (
        <article className="card" key={item.id}>
          <h3>{item.index}. {item.title}</h3>
          <div className="prompt-grid">
            <Editable label="Title" value={item.title} />
            <Editable label="Reference image prompt" value={item.referenceImagePrompt} rows={3} />
            <Editable label="Video prompt" value={item.videoPrompt} rows={3} />
            <Editable label="Action" value={item.promptParts.action} />
            <Editable label="Character" value={item.promptParts.character} />
            <Editable label="Expression" value={item.promptParts.expression} />
            <Editable label="Shots" value={item.promptParts.shots.map((shot) => `${shot.shotNo}. ${shot.camera}; ${shot.action}; ${shot.environment}; ${shot.lighting}`).join("\n")} rows={3} />
            <Editable label="Environment" value={item.promptParts.environment} />
            <Editable label="Lighting" value={item.promptParts.lighting} />
            <Editable label="Camera" value={item.promptParts.camera} />
            <Editable label="Music style" value={item.promptParts.musicStyle} />
            <Editable label="Dialogue" value={item.promptParts.dialogue} />
            <Editable label="Negative prompt" value={item.promptParts.negativePrompt} rows={2} />
          </div>
        </article>
      ))}
    </div>
  );
}

function Editable({ label, value, rows = 1 }: { label: string; value: string; rows?: number }) {
  return (
    <label className="field">
      <span>{label}</span>
      {rows > 1 ? <textarea defaultValue={value} rows={rows} /> : <input defaultValue={value} />}
    </label>
  );
}
