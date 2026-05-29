import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { VideoBatch, VideoBatchSchema, VideoBatchStatus } from "@/lib/schemas/videoBatch.schema";
import { VideoCreativeItem } from "@/lib/schemas/videoCreativeItem.schema";

export type CreateVideoBatchInput = {
  title?: string;
  sourceTopic: string;
  platform?: VideoBatch["platform"];
  aspectRatio?: VideoBatch["aspectRatio"];
};

export type GeneratePromptItemsInput = {
  batchId: string;
  count?: number;
  persona?: string;
  styleNotes?: string;
};

export const videoBatchStorageRoot = path.join(process.cwd(), "storage", "video-batches");

export function batchDir(batchId: string): string {
  return path.join(videoBatchStorageRoot, batchId);
}

export function batchManifestPath(batchId: string): string {
  return path.join(batchDir(batchId), "batch_manifest.json");
}

export async function createVideoBatch(input: CreateVideoBatchInput): Promise<VideoBatch> {
  const now = new Date().toISOString();
  const id = `batch_${now.replace(/[-:.TZ]/g, "").slice(0, 14)}_${Math.random().toString(36).slice(2, 8)}`;
  const batch: VideoBatch = {
    id,
    title: input.title || input.sourceTopic,
    sourceTopic: input.sourceTopic,
    platform: input.platform || "tiktok",
    aspectRatio: input.aspectRatio || "9:16",
    status: "draft",
    videoFactory: {},
    items: [],
    createdAt: now,
    updatedAt: now
  };
  return saveBatch(batch);
}

export async function generateMockVideoCreativeItems(input: GeneratePromptItemsInput): Promise<VideoBatch> {
  const batch = await loadBatch(input.batchId);
  const personas = input.persona
    ? input.persona.split(",").map((item) => item.trim()).filter(Boolean)
    : ["custom"];
  const count = input.count || 10;
  const items: VideoCreativeItem[] = Array.from({ length: count }, (_, index) => {
    const itemNo = index + 1;
    const persona = personas[index % personas.length] || "custom";
    const itemId = `item_${String(itemNo).padStart(3, "0")}`;
    const character = persona === "custom"
      ? `A memorable lead character for ${batch.sourceTopic}`
      : `${persona}, a consistent lead character`;
    const style = input.styleNotes ? ` Style notes: ${input.styleNotes}.` : "";
    return {
      id: itemId,
      batchId: batch.id,
      index: itemNo,
      persona: persona === "custom" ? undefined : persona,
      title: `${batch.sourceTopic} concept ${itemNo}`,
      referenceImagePrompt: `${character}, clean vertical hero reference image, expressive face, clear pose, high production value.${style}`,
      videoPrompt: `${character} performs a short high-retention scene about ${batch.sourceTopic}, with a fast opening hook and readable motion.${style}`,
      promptParts: {
        action: `Show a practical, surprising moment about ${batch.sourceTopic}`,
        character,
        expression: itemNo % 2 === 0 ? "confident smile and focused eyes" : "curious surprise turning into delight",
        shots: [
          {
            shotNo: 1,
            durationSec: 2,
            camera: "medium close-up, slow push-in",
            action: "the character notices the problem",
            environment: `clean setting related to ${batch.sourceTopic}`,
            lighting: "soft cinematic key light"
          },
          {
            shotNo: 2,
            durationSec: 3,
            camera: "dynamic side move, shallow depth of field",
            action: "the character reveals the useful twist",
            environment: `layered background details for ${batch.sourceTopic}`,
            lighting: "bright rim light and natural highlights"
          }
        ],
        environment: `modern uncluttered environment themed around ${batch.sourceTopic}`,
        lighting: "cinematic soft light, high contrast, natural skin tones",
        camera: "vertical 9:16 composition, stable subject framing",
        musicStyle: "upbeat short-form pop with light percussion",
        dialogue: `One punchy line that makes ${batch.sourceTopic} instantly useful.`,
        negativePrompt: "low quality, blurry, distorted hands, duplicate face, unreadable text, watermark, logo"
      },
      referenceImage: {
        status: "missing"
      },
      generation: {
        status: "draft"
      },
      postProcessing: {
        watermarkStatus: "pending"
      }
    };
  });
  return saveBatch({ ...batch, status: "prompts_ready", items });
}

export async function loadBatch(batchId: string): Promise<VideoBatch> {
  const filePath = batchManifestPath(batchId);
  if (!existsSync(filePath)) throw new Error(`Batch manifest not found: ${filePath}`);
  return VideoBatchSchema.parse(JSON.parse(await readFile(filePath, "utf8")));
}

export async function saveBatch(batch: VideoBatch): Promise<VideoBatch> {
  const parsed = VideoBatchSchema.parse({ ...batch, updatedAt: new Date().toISOString() });
  await mkdir(batchDir(parsed.id), { recursive: true });
  await writeFile(batchManifestPath(parsed.id), `${JSON.stringify(parsed, null, 2)}\n`);
  return parsed;
}

export async function listBatches(): Promise<VideoBatch[]> {
  if (!existsSync(videoBatchStorageRoot)) return [];
  const entries = await readdir(videoBatchStorageRoot, { withFileTypes: true });
  const batches = await Promise.all(entries.filter((entry) => entry.isDirectory()).map(async (entry) => {
    try {
      return await loadBatch(entry.name);
    } catch {
      return null;
    }
  }));
  return batches.filter((batch): batch is VideoBatch => Boolean(batch)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function updateBatchStatus(batchId: string, status: VideoBatchStatus): Promise<VideoBatch> {
  const batch = await loadBatch(batchId);
  return saveBatch({ ...batch, status });
}

export async function writeBatchFile(batchId: string, fileName: string, content: string): Promise<string> {
  const filePath = path.join(batchDir(batchId), fileName);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content);
  return filePath;
}

export async function exportFinalReport(batchId: string): Promise<{ batch: VideoBatch; finalReportPath: string }> {
  const batch = await loadBatch(batchId);
  const lines = [
    `# Final report: ${batch.title}`,
    "",
    `- Batch ID: ${batch.id}`,
    `- Status: ${batch.status}`,
    `- Items: ${batch.items.length}`,
    `- Public images: ${batch.items.filter((item) => item.referenceImage.publicUrl).length}`,
    `- Successful videos: ${batch.items.filter((item) => item.generation.status === "video_succeeded").length}`,
    `- Watermark processed: ${batch.items.filter((item) => item.postProcessing.watermarkStatus === "done").length}`,
    "",
    "## Items",
    ...batch.items.map((item) => [
      "",
      `### ${item.id} - ${item.title}`,
      `- Image: ${item.referenceImage.status}${item.referenceImage.publicUrl ? ` (${item.referenceImage.publicUrl})` : ""}`,
      `- Video: ${item.generation.status}${item.generation.videoUrl ? ` (${item.generation.videoUrl})` : ""}`,
      `- Watermark: ${item.postProcessing.watermarkStatus}${item.postProcessing.processedVideoUrl ? ` (${item.postProcessing.processedVideoUrl})` : ""}`
    ].join("\n"))
  ];
  const finalReportPath = await writeBatchFile(batch.id, "final_report.md", `${lines.join("\n")}\n`);
  return { batch, finalReportPath };
}
