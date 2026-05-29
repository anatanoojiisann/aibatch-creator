import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { batchDir, saveBatch } from "@/lib/services/batchService";
import { VideoBatch } from "@/lib/schemas/videoBatch.schema";
import { VideoCreativeItem } from "@/lib/schemas/videoCreativeItem.schema";

export type PromptDirResult = {
  promptDir: string;
  files: Array<{ itemId: string; filePath: string }>;
};

export async function exportPromptDir(batch: VideoBatch): Promise<PromptDirResult> {
  const promptDir = path.join(batchDir(batch.id), "prompt-dir");
  await mkdir(promptDir, { recursive: true });
  const files: Array<{ itemId: string; filePath: string }> = [];
  for (const item of batch.items) {
    const folder = path.join(promptDir, safeSegment(item.persona || "custom"));
    await mkdir(folder, { recursive: true });
    const filePath = path.join(folder, `${String(item.index).padStart(2, "0")}.txt`);
    await writeFile(filePath, renderPrompt(item));
    files.push({ itemId: item.id, filePath });
  }
  await saveBatch({
    ...batch,
    status: "prompt_dir_exported",
    videoFactory: { ...batch.videoFactory, promptDir },
    items: batch.items.map((item) => ({
      ...item,
      referenceImage: { ...item.referenceImage, status: "pending" },
      generation: { ...item.generation, status: "waiting_for_image" }
    }))
  });
  return { promptDir, files };
}

export function renderPrompt(item: VideoCreativeItem): string {
  return [
    `VIDEO_BATCH_ITEM_ID: ${item.id}`,
    `TITLE: ${item.title}`,
    `PERSONA: ${item.persona || "custom"}`,
    "",
    "正向提示词：",
    item.referenceImagePrompt,
    "",
    "动作与镜头：",
    `Action: ${item.promptParts.action}`,
    `Character: ${item.promptParts.character}`,
    `Expression: ${item.promptParts.expression}`,
    ...item.promptParts.shots.map((shot) => `${shot.shotNo}. ${shot.durationSec}s, ${shot.camera}, ${shot.action}, ${shot.environment}, ${shot.lighting}`),
    `Environment: ${item.promptParts.environment}`,
    `Lighting: ${item.promptParts.lighting}`,
    `Camera: ${item.promptParts.camera}`,
    `Music: ${item.promptParts.musicStyle}`,
    `Dialogue: ${item.promptParts.dialogue}`,
    "",
    "剧情钩子：",
    item.videoPrompt,
    "",
    "负向提示词：",
    item.promptParts.negativePrompt
  ].join("\n");
}

function safeSegment(value: string): string {
  return value.trim().replace(/[^\w.-]+/g, "_") || "custom";
}
