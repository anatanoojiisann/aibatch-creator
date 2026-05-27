import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { batchRunDir, saveBatch, writeBatchArtifact } from "@/services/batchService";
import { VideoBatch } from "@/schemas/videoBatch.schema";
import { VideoCreativeItem } from "@/schemas/videoCreativeItem.schema";

export type PromptDirExportResult = {
  promptDir: string;
  files: Array<{ itemId: string; filePath: string }>;
};

export async function exportPromptDir(batch: VideoBatch): Promise<PromptDirExportResult> {
  const promptDir = path.join(batchRunDir(batch.id), "prompt-dir");
  await mkdir(promptDir, { recursive: true });
  const files: Array<{ itemId: string; filePath: string }> = [];

  for (const item of batch.items) {
    const personaFolder = safeSegment(item.persona || "custom");
    const folder = path.join(promptDir, personaFolder);
    await mkdir(folder, { recursive: true });
    const filePath = path.join(folder, `${String(item.index).padStart(2, "0")}.txt`);
    await writeFile(filePath, renderVideoFactoryPrompt(item));
    files.push({ itemId: item.id, filePath });
  }

  const next = await saveBatch({
    ...batch,
    status: "prompt_dir_exported",
    videoFactory: {
      ...batch.videoFactory,
      runDir: batchRunDir(batch.id),
      promptDir,
    },
    items: batch.items.map((item) => ({
      ...item,
      referenceImage: { ...item.referenceImage, status: "pending" },
      generation: { ...item.generation, status: "waiting_for_image" },
    })),
  });
  await writeBatchArtifact(next, "import_report.md", `# Import report\n\nExported ${files.length} prompt files for ${next.id}.\n`);
  return { promptDir, files };
}

export function renderVideoFactoryPrompt(item: VideoCreativeItem): string {
  const shots = item.promptParts.shots
    .map((shot) => `${shot.shotNo}. ${shot.durationSec}s, ${shot.camera}, ${shot.action}, ${shot.environment}, ${shot.lighting}`)
    .join("\n");
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
    shots,
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
    item.promptParts.negativePrompt,
  ].join("\n");
}

function safeSegment(value: string): string {
  return value.trim().replace(/[^\w.-]+/g, "_") || "custom";
}
