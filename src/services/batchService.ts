import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { VideoBatch, VideoBatchSchema, VideoBatchStatus } from "@/schemas/videoBatch.schema";
import { VideoCreativeItem } from "@/schemas/videoCreativeItem.schema";

export type CreateVideoBatchInput = {
  topic: string;
  platform?: VideoBatch["platform"];
  aspectRatio?: VideoBatch["aspectRatio"];
  persona?: string;
  count?: number;
  styleNotes?: string;
  title?: string;
};

export const runsRoot = path.join(process.cwd(), "runs");

export function batchRunDir(batchId: string): string {
  return path.join(runsRoot, batchId);
}

export function batchManifestPath(batchId: string): string {
  return path.join(batchRunDir(batchId), "batch_manifest.json");
}

export async function createVideoBatch(input: CreateVideoBatchInput): Promise<VideoBatch> {
  const now = new Date().toISOString();
  const id = `batch_${now.replace(/[-:.TZ]/g, "").slice(0, 14)}_${randomSuffix()}`;
  const batch: VideoBatch = {
    id,
    title: input.title || input.topic,
    sourceTopic: input.topic,
    platform: input.platform || "tiktok",
    aspectRatio: input.aspectRatio || "9:16",
    status: "prompts_ready",
    videoFactory: {
      runDir: batchRunDir(id),
    },
    items: generateMockCreativeItems({
      batchId: id,
      topic: input.topic,
      count: input.count || 10,
      persona: input.persona,
      styleNotes: input.styleNotes,
    }),
    createdAt: now,
    updatedAt: now,
  };
  await saveBatch(batch);
  return batch;
}

export async function saveBatch(batch: VideoBatch): Promise<VideoBatch> {
  const next = VideoBatchSchema.parse({
    ...batch,
    updatedAt: new Date().toISOString(),
  });
  await mkdir(batchRunDir(next.id), { recursive: true });
  await writeFile(batchManifestPath(next.id), `${JSON.stringify(next, null, 2)}\n`);
  return next;
}

export async function loadBatch(batchId: string): Promise<VideoBatch> {
  const file = batchManifestPath(batchId);
  if (!existsSync(file)) {
    throw new Error(`VideoBatch manifest not found: ${file}`);
  }
  return VideoBatchSchema.parse(JSON.parse(await readFile(file, "utf8")));
}

export async function listBatches(): Promise<VideoBatch[]> {
  if (!existsSync(runsRoot)) return [];
  const entries = await readdir(runsRoot, { withFileTypes: true });
  const batches = await Promise.all(entries
    .filter((entry) => entry.isDirectory())
    .map(async (entry) => {
      try {
        return await loadBatch(entry.name);
      } catch {
        return null;
      }
    }));
  return batches
    .filter((batch): batch is VideoBatch => Boolean(batch))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function updateBatchStatus(batchId: string, status: VideoBatchStatus): Promise<VideoBatch> {
  const batch = await loadBatch(batchId);
  return saveBatch({ ...batch, status });
}

export async function writeBatchArtifact(batch: VideoBatch, name: string, content: string): Promise<string> {
  const filePath = path.join(batchRunDir(batch.id), name);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content);
  return filePath;
}

export async function writeFinalReport(batch: VideoBatch): Promise<string> {
  const completed = batch.items.filter((item) => item.postProcessing.watermarkStatus === "done").length;
  const videoSucceeded = batch.items.filter((item) => item.generation.status === "video_succeeded").length;
  const imageUploaded = batch.items.filter((item) => item.referenceImage.status === "uploaded_public").length;
  const lines = [
    `# Final report: ${batch.title}`,
    "",
    `- Batch ID: ${batch.id}`,
    `- Status: ${batch.status}`,
    `- Items: ${batch.items.length}`,
    `- Public images: ${imageUploaded}`,
    `- Successful videos: ${videoSucceeded}`,
    `- Watermark processed: ${completed}`,
    `- Generated: ${new Date().toISOString()}`,
    "",
    "## Items",
    ...batch.items.map((item) => [
      "",
      `### ${item.id} - ${item.title}`,
      `- Image: ${item.referenceImage.status}${item.referenceImage.publicUrl ? ` (${item.referenceImage.publicUrl})` : ""}`,
      `- Video: ${item.generation.status}${item.generation.videoUrl ? ` (${item.generation.videoUrl})` : ""}`,
      `- Watermark: ${item.postProcessing.watermarkStatus}${item.postProcessing.processedVideoUrl ? ` (${item.postProcessing.processedVideoUrl})` : ""}`,
    ].join("\n")),
  ];
  return writeBatchArtifact(batch, "final_report.md", `${lines.join("\n")}\n`);
}

function generateMockCreativeItems(input: {
  batchId: string;
  topic: string;
  count: number;
  persona?: string;
  styleNotes?: string;
}): VideoCreativeItem[] {
  const personas = input.persona
    ? input.persona.split(",").map((persona) => persona.trim()).filter(Boolean)
    : ["custom"];
  return Array.from({ length: input.count }, (_, index) => {
    const itemNo = index + 1;
    const persona = personas[index % personas.length] || "custom";
    const id = `item_${String(itemNo).padStart(3, "0")}`;
    const style = input.styleNotes ? ` Style notes: ${input.styleNotes}.` : "";
    const character = persona === "custom" ? `A distinctive lead character for ${input.topic}` : `${persona}, a consistent lead character`;
    return {
      id,
      batchId: input.batchId,
      index: itemNo,
      persona: persona === "custom" ? undefined : persona,
      title: `${input.topic} concept ${itemNo}`,
      referenceImagePrompt: `${character}, vertical cinematic key visual for ${input.topic}, expressive pose, clear face, clean composition.${style}`,
      videoPrompt: `${character} performs a short, high-retention scene about ${input.topic}; energetic motion, readable emotion, strong opening hook.${style}`,
      promptParts: {
        action: `Create a short scene beat ${itemNo} about ${input.topic}`,
        character,
        expression: itemNo % 2 === 0 ? "confident smile with focused eyes" : "surprised delight turning into confidence",
        shots: [
          {
            shotNo: 1,
            durationSec: 2,
            camera: "medium close-up, slow push-in",
            action: "the character notices the central problem",
            environment: `a visually clear setting related to ${input.topic}`,
            lighting: "soft cinematic key light",
          },
          {
            shotNo: 2,
            durationSec: 3,
            camera: "dynamic side move with shallow depth of field",
            action: "the character demonstrates the twist or solution",
            environment: `layered background details for ${input.topic}`,
            lighting: "bright rim light and clean highlights",
          },
        ],
        environment: `modern, uncluttered environment themed around ${input.topic}`,
        lighting: "cinematic soft light, high contrast but natural skin tones",
        camera: "vertical 9:16 composition, stable subject framing",
        musicStyle: "upbeat short-form pop with light percussion",
        dialogue: `One punchy line that makes ${input.topic} feel instantly useful.`,
        negativePrompt: "low quality, blurry, distorted hands, duplicate face, unreadable text, watermark, logo",
      },
      referenceImage: {
        status: "missing",
      },
      generation: {
        provider: "videofactory",
        status: "draft",
      },
      postProcessing: {
        watermarkStatus: "pending",
      },
    };
  });
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 8);
}
