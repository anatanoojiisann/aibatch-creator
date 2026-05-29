"use client";

import { FormEvent } from "react";

export type BatchCreatorValues = {
  sourceTopic: string;
  platform: string;
  aspectRatio: string;
  persona: string;
  count: number;
  styleNotes: string;
};

export function BatchCreator({ disabled, onCreate }: {
  disabled?: boolean;
  onCreate: (values: BatchCreatorValues) => void;
}) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    onCreate({
      sourceTopic: String(form.get("sourceTopic") || "AI desk setup tips"),
      platform: String(form.get("platform") || "tiktok"),
      aspectRatio: String(form.get("aspectRatio") || "9:16"),
      persona: String(form.get("persona") || ""),
      count: Number(form.get("count") || 10),
      styleNotes: String(form.get("styleNotes") || "")
    });
  }

  return (
    <form onSubmit={submit}>
      <label className="field">
        <span>Topic</span>
        <input name="sourceTopic" defaultValue="AI desk setup tips" required />
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
        <textarea name="styleNotes" rows={3} placeholder="Bright, practical, fast hook" />
      </label>
      <button className="primary" disabled={disabled}>Create Batch + Generate Prompts</button>
    </form>
  );
}
