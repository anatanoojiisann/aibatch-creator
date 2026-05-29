"use client";

import { VideoCreativeItem } from "@/lib/schemas/videoCreativeItem.schema";
import { StatusBadge } from "@/components/video-workflow/StatusBadge";

export function ImagePreviewTable({ items }: {
  items: VideoCreativeItem[];
}) {
  return (
    <div className="table">
      {items.map((item) => (
        <article className="card preview-row" key={item.id}>
          <div className="preview">
            {item.referenceImage.previewUrl ? <img alt="" src={item.referenceImage.previewUrl} /> : item.id}
          </div>
          <div>
            <h3>{item.title}</h3>
            <div className="actions">
              <StatusBadge value={`image: ${item.referenceImage.status}`} />
              <StatusBadge value={`video: ${item.generation.status}`} />
              <StatusBadge value={`watermark: ${item.postProcessing.watermarkStatus}`} />
            </div>
            <p className="muted">{item.referenceImage.publicUrl || item.generation.videoUrl || item.postProcessing.processedVideoUrl || "No public output yet."}</p>
          </div>
        </article>
      ))}
    </div>
  );
}
