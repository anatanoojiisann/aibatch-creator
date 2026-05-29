import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { batchDir, createVideoBatch, exportFinalReport, generateMockVideoCreativeItems, loadBatch, saveBatch } from "@/lib/services/batchService";
import { createVideoFactoryAdapter, writeCommandManifest } from "@/lib/integrations/videofactory/videoFactoryAdapter";
import { generateImageUrlMap, uploadApprovedImages } from "@/lib/services/publicAssetService";
import { sendSuccessfulVideosToWatermark } from "@/lib/services/watermarkConnector";

process.env.VIDEO_FACTORY_PATH ||= "/Users/steven-mac2/Documents/VideoFactory";
process.env.VIDEO_FACTORY_BRIDGE_URL ||= "https://admin666.aurax.one";
process.env.PUBLIC_ASSET_PROVIDER ||= "mock";
process.env.PUBLIC_ASSET_BASE_URL ||= "https://your-domain.example/assets";

const tinyPng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=", "base64");

async function main() {
  const created = await createVideoBatch({
    sourceTopic: "AI desk setup tips",
    platform: "tiktok",
    aspectRatio: "9:16"
  });
  const withPrompts = await generateMockVideoCreativeItems({
    batchId: created.id,
    count: 10,
    styleNotes: "bright, practical, premium"
  });

  const adapter = createVideoFactoryAdapter();
  const setup = await adapter.checkSetup();
  assert(setup.ok, `VideoFactory setup failed: ${setup.errors.join("; ")}`);

  const promptResult = await adapter.createPromptDir(withPrompts);
  assert(promptResult.files.length === 10, "Expected 10 prompt files.");
  for (const file of promptResult.files) assert(existsSync(file.filePath), `Missing prompt file: ${file.filePath}`);

  const imageSubmit = await adapter.submitImages({
    promptDir: promptResult.promptDir,
    dryRun: true,
    limit: 1
  });
  assert(imageSubmit.ok, `Dry-run submit-images failed: ${imageSubmit.stderr || imageSubmit.stdout}`);
  await writeCommandManifest(created.id, "video_factory_image_result.json", imageSubmit);

  const outputDir = path.join(batchDir(created.id), "video-factory-output");
  await mkdir(outputDir, { recursive: true });
  const synced = await loadBatch(created.id);
  const downloadedFiles: string[] = [];
  const ready = await saveBatch({
    ...synced,
    status: "image_ready_for_preview",
    videoFactory: { ...synced.videoFactory, outputDir },
    items: await Promise.all(synced.items.map(async (item) => {
      const localPath = path.join(outputDir, `${item.id}.png`);
      await writeFile(localPath, tinyPng);
      downloadedFiles.push(localPath);
      return {
        ...item,
        referenceImage: {
          ...item.referenceImage,
          status: item.index === 1 ? "approved" as const : "ready_for_preview" as const,
          localPath,
          previewUrl: `/api/video-batches/sync-images?file=${encodeURIComponent(localPath)}`
        }
      };
    }))
  });
  await writeFile(path.join(batchDir(created.id), "video_factory_sync_result.json"), `${JSON.stringify({ mock: true, outputDir, downloadedFiles }, null, 2)}\n`);

  const uploaded = await uploadApprovedImages(ready);
  assert(uploaded.uploaded.length >= 1, "Expected at least one uploaded public URL.");
  const mapped = await generateImageUrlMap(uploaded.batch);
  assert(existsSync(mapped.imageUrlMapPath), "Expected image-url-map.json.");

  const videoSubmit = await adapter.submitVideos({
    promptDir: promptResult.promptDir,
    imageUrlMapPath: mapped.imageUrlMapPath,
    dryRun: true,
    limit: 1
  });
  assert(videoSubmit.ok, `Dry-run submit-videos failed: ${videoSubmit.stderr || videoSubmit.stdout}`);
  await writeCommandManifest(created.id, "video_factory_video_result.json", videoSubmit);

  const submitted = await loadBatch(created.id);
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
          videoUrl: `https://your-domain.example/videos/${submitted.id}/${item.id}.mp4`
        }
      }
      : item)
  });
  const watermarked = await sendSuccessfulVideosToWatermark(videoReady, true);
  const report = await exportFinalReport(watermarked.id);

  const summary = {
    batchId: created.id,
    batchDir: batchDir(created.id),
    promptDir: promptResult.promptDir,
    promptFiles: promptResult.files.length,
    setup,
    dryRunSubmitImages: { ok: imageSubmit.ok, command: imageSubmit.command, stdoutTail: imageSubmit.stdout.slice(-500), stderrTail: imageSubmit.stderr.slice(-500) },
    uploaded: uploaded.uploaded,
    imageUrlMapPath: mapped.imageUrlMapPath,
    dryRunSubmitVideos: { ok: videoSubmit.ok, command: videoSubmit.command, stdoutTail: videoSubmit.stdout.slice(-500), stderrTail: videoSubmit.stderr.slice(-500) },
    finalReportPath: report.finalReportPath,
    realRemotePixVerseCallMade: false
  };
  await writeFile(path.join(batchDir(created.id), "smoke_report.json"), `${JSON.stringify(summary, null, 2)}\n`);
  console.log(JSON.stringify(summary, null, 2));
}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
