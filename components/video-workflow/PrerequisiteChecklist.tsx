"use client";

import { VideoBatch } from "@/lib/schemas/videoBatch.schema";
import { getVideoWorkflowPrerequisites, nextRecommendedAction } from "@/lib/services/videoSubmissionGuard";

export function PrerequisiteChecklist({ batch }: { batch: VideoBatch | null }) {
  if (!batch) {
    return (
      <div className="checklist">
        <h2>Prerequisites</h2>
        <p className="muted">Create a batch to begin.</p>
      </div>
    );
  }
  const prerequisites = getVideoWorkflowPrerequisites(batch);
  const rows = [
    ["Prompt dir exported", prerequisites.promptDirExported],
    ["Images submitted", prerequisites.imagesSubmitted],
    ["Images synced", prerequisites.imagesSynced],
    ["At least one image approved", prerequisites.atLeastOneImageApproved],
    ["Public image URL generated", prerequisites.publicImageUrlGenerated],
    ["Image URL map generated", prerequisites.imageUrlMapGenerated],
    ["Ready to submit videos", prerequisites.readyToSubmitVideos]
  ] as const;
  return (
    <div className="checklist">
      <h2>Prerequisites</h2>
      <ul>
        {rows.map(([label, done]) => (
          <li key={label} className={done ? "done" : "todo"}>
            <span>{done ? "✓" : "•"}</span>
            {label}
          </li>
        ))}
      </ul>
      <p className="recommendation">{nextRecommendedAction(prerequisites)}</p>
    </div>
  );
}
