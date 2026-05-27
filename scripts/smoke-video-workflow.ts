import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { createVideoBatch, batchRunDir, loadBatch, saveBatch, writeFinalReport, writeBatchArtifact } from "../src/services/batchService";
import { uploadPublicImages } from "../src/services/publicAssetService";
import { sendBatchToWatermark } from "../src/services/watermarkConnector";
import { createVideoFactoryAdapter, mirrorResultFile } from "../src/integrations/videofactory/videoFactoryAdapter";

process.env.VIDEO_FACTORY_PATH ||= "/Users/steven-mac2/Documents/VideoFactory";
process.env.VIDEO_FACTORY_BRIDGE_URL ||= "https://admin666.aurax.one";
process.env.PUBLIC_ASSET_PROVIDER ||= "mock";
process.env.PUBLIC_ASSET_BASE_URL ||= "https://your-domain.example/assets";

const tinyPng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=", "base64");

async function main() {
  const adapter = createVideoFactoryAdapter();
  const batch = await createVideoBatch({
    topic: "AI desk setup tips",
    platform: "tiktok",
    aspectRatio: "9:16",
    persona: "Aiko,Lune",
    count: 10,
    styleNotes: "bright, practical, premium",
  });

  const promptExport = await adapter.createPromptDir(batch);
  assert(promptExport.files.length === 10, "Expected 10 prompt files.");
  for (const file of promptExport.files) assert(existsSync(file.filePath), `Missing prompt file: ${file.filePath}`);

  const setup = await adapter.checkSetup();
  assert(setup.errors.length === 0, `VideoFactory setup failed: ${setup.errors.join("; ")}`);

  const imageSubmit = await adapter.submitImages({
    promptDir: promptExport.promptDir,
    remote: false,
    dryRun: true,
    limit: 1,
    modelLimit: 1,
    batchId: batch.id,
  });
  await mirrorResultFile(imageSubmit.manifestPath, path.join(batchRunDir(batch.id), "video_factory_image_result.json"));

  const outputDir = path.join(batchRunDir(batch.id), "video-factory-output");
  await mkdir(outputDir, { recursive: true });
  const synced = await loadBatch(batch.id);
  const ready = await saveBatch({
    ...synced,
    status: "image_ready_for_preview",
    videoFactory: { ...synced.videoFactory, outputDir },
    items: await Promise.all(synced.items.map(async (item) => {
      const localPath = path.join(outputDir, `${item.id}.png`);
      await writeFile(localPath, tinyPng);
      return {
        ...item,
        referenceImage: {
          ...item.referenceImage,
          status: "approved" as const,
          localPath,
          previewUrl: `/api/video-batches/import?path=${encodeURIComponent(localPath)}`,
        },
      };
    })),
  });
  await writeFile(path.join(batchRunDir(batch.id), "video_factory_sync_result.json"), `${JSON.stringify({
    mock: true,
    outputDir,
    downloadedFiles: ready.items.map((item) => item.referenceImage.localPath),
  }, null, 2)}\n`);

  const publicUpload = await uploadPublicImages(ready);
  assert(publicUpload.uploaded.length === 10, "Expected 10 mock public image URLs.");

  const withPublicUrls = await loadBatch(batch.id);
  const videoSubmit = await adapter.submitVideos({
    promptDir: withPublicUrls.videoFactory.promptDir || promptExport.promptDir,
    imageUrlMapPath: publicUpload.imageUrlMapPath,
    remote: false,
    dryRun: true,
    limit: 1,
    batchId: batch.id,
  });
  await mirrorResultFile(videoSubmit.manifestPath, path.join(batchRunDir(batch.id), "video_factory_video_result.json"));

  const submitted = await loadBatch(batch.id);
  const videoReady = await saveBatch({
    ...submitted,
    status: "video_ready",
    items: submitted.items.map((item, index) => index === 0
      ? {
        ...item,
        generation: {
          ...item.generation,
          status: "video_succeeded" as const,
          videoJobId: `mock_video_${item.id}`,
          videoUrl: `https://your-domain.example/videos/${submitted.id}/${item.id}.mp4`,
        },
      }
      : item),
  });
  const watermarked = await sendBatchToWatermark(videoReady, "extra_fast", true);
  const finalReportPath = await writeFinalReport(watermarked);

  const startCheck = await runCommand("bash", [
    "start.sh",
    "--prompt-dir",
    promptExport.promptDir,
    "--dry-run",
    "--skip-ai",
    "--limit",
    "1",
    "--model-limit",
    "1",
  ], process.env.VIDEO_FACTORY_PATH || "");

  const report = {
    batchId: batch.id,
    promptDir: promptExport.promptDir,
    promptFiles: promptExport.files.length,
    videoFactorySetup: setup,
    imageSubmit: summarizeCommand(imageSubmit),
    publicUpload,
    videoSubmit: summarizeCommand(videoSubmit),
    watermarkProcessed: watermarked.items.filter((item) => item.postProcessing.watermarkStatus === "done").length,
    finalReportPath,
    originalCommandCheck: summarizeCommand(startCheck),
    realRemoteCallExecuted: false,
  };
  await writeBatchArtifact(watermarked, "smoke_report.json", `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function summarizeCommand(result: { ok: boolean; command: string; stdout: string; stderr: string }) {
  return {
    ok: result.ok,
    command: result.command,
    stdoutTail: result.stdout.slice(-1200),
    stderrTail: result.stderr.slice(-1200),
  };
}

function runCommand(command: string, args: string[], cwd: string): Promise<{ ok: boolean; command: string; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd, env: process.env });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
    child.on("close", (code) => resolve({
      ok: code === 0,
      command: `${command} ${args.join(" ")}`,
      stdout,
      stderr,
    }));
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
