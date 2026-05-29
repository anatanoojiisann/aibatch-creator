import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { batchDir } from "@/lib/services/batchService";
import { exportPromptDir } from "@/lib/services/promptDirService";
import { generateImageUrlMap, uploadApprovedImages } from "@/lib/services/publicAssetService";
import { VideoBatch } from "@/lib/schemas/videoBatch.schema";
import { parseVideoFactoryManifest } from "@/lib/integrations/videofactory/videoFactoryResultParser";
import {
  ReadResultManifestResult,
  SubmitImagesOptions,
  SubmitVideosOptions,
  SyncRelaxImagesOptions,
  VideoFactoryAdapterConfig,
  VideoFactoryCommandResult,
  VideoFactorySetupResult
} from "@/lib/integrations/videofactory/videoFactoryTypes";

export class VideoFactoryAdapter {
  constructor(private readonly config: VideoFactoryAdapterConfig) {}

  async checkSetup(): Promise<VideoFactorySetupResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    if (!this.config.videoFactoryPath || !existsSync(this.config.videoFactoryPath)) {
      errors.push(`VIDEO_FACTORY_PATH does not exist: ${this.config.videoFactoryPath || "(empty)"}`);
    } else if (!existsSync(path.join(this.config.videoFactoryPath, "package.json"))) {
      errors.push(`VIDEO_FACTORY_PATH is not a Node.js project: ${this.config.videoFactoryPath}`);
    }
    if (!this.config.apiKey) {
      warnings.push("PIXVERSE_WEB_PROVIDER_API_KEY is missing; remote submission is blocked and dry-run mode remains available.");
    }
    return { ok: errors.length === 0, errors, warnings };
  }

  async createPromptDir(batch: VideoBatch) {
    return exportPromptDir(batch);
  }

  async submitImages(options: SubmitImagesOptions): Promise<VideoFactoryCommandResult> {
    const dryRun = options.dryRun !== false || !options.remote;
    this.assertRemoteAllowed(options.remote === true, dryRun, options.confirmedRemote, options.limit, options.confirmedFullBatch);
    const args = ["run", "submit-images", "--", "--prompt-dir", options.promptDir];
    if (dryRun) {
      args.push("--dry-run", "--limit", "1");
    } else {
      args.push("--limit", String(remoteLimit(options.limit)), "--model-limit", String(options.modelLimit || 1));
    }
    return this.runNpm(args);
  }

  async syncRelaxImages(options: SyncRelaxImagesOptions = {}): Promise<VideoFactoryCommandResult> {
    if (!this.config.apiKey) {
      throw new Error("PIXVERSE_WEB_PROVIDER_API_KEY is missing; remote image sync is unavailable.");
    }
    const args = [
      "run",
      "sync-relax-images",
      "--",
      "--all",
      "--date",
      options.date || "today",
      "--bridge-url",
      this.config.bridgeUrl
    ];
    if (options.deleteRemote) args.push("--delete-remote");
    return this.runNpm(args);
  }

  async uploadPublicImages(batch: VideoBatch) {
    const upload = await uploadApprovedImages(batch);
    const map = await generateImageUrlMap(upload.batch);
    return {
      ok: upload.ok,
      imageUrlMapPath: map.imageUrlMapPath,
      uploaded: upload.uploaded,
      failed: upload.failed,
      batch: map.batch
    };
  }

  async submitVideos(options: SubmitVideosOptions): Promise<VideoFactoryCommandResult> {
    const dryRun = options.dryRun !== false || !options.remote;
    this.assertRemoteAllowed(options.remote === true, dryRun, options.confirmedRemote, options.limit, options.confirmedFullBatch);
    const args = ["run", "submit-videos", "--", "--prompt-dir", options.promptDir, "--image-url-map", options.imageUrlMapPath];
    if (dryRun) {
      args.push("--dry-run", "--limit", "1");
    } else {
      args.push("--limit", String(remoteLimit(options.limit)));
    }
    return this.runNpm(args);
  }

  async readResultManifest(batch: VideoBatch): Promise<ReadResultManifestResult> {
    return parseVideoFactoryManifest({
      imageResultPath: path.join(batchDir(batch.id), "video_factory_image_result.json"),
      syncResultPath: path.join(batchDir(batch.id), "video_factory_sync_result.json"),
      videoResultPath: path.join(batchDir(batch.id), "video_factory_video_result.json"),
      imageUrlMapPath: batch.videoFactory.imageUrlMapPath
    });
  }

  private assertRemoteAllowed(remote: boolean, dryRun: boolean, confirmedRemote?: boolean, limit?: number, confirmedFullBatch?: boolean) {
    if (!remote || dryRun) return;
    if (!this.config.apiKey) throw new Error("PIXVERSE_WEB_PROVIDER_API_KEY is missing; remote submission is blocked.");
    if (!confirmedRemote) throw new Error("Remote submission requires explicit user confirmation.");
    if (Number(limit || 1) > 1 && !confirmedFullBatch) throw new Error("Full batch remote submission requires explicit Run Full Batch confirmation.");
  }

  private async runNpm(args: string[]): Promise<VideoFactoryCommandResult> {
    const setup = await this.checkSetup();
    if (!setup.ok) throw new Error(setup.errors.join("\n"));
    const command = `npm ${args.join(" ")}`;
    return new Promise((resolve) => {
      const child = spawn("npm", args, {
        cwd: this.config.videoFactoryPath,
        env: {
          ...process.env,
          PIXVERSE_WEB_PROVIDER_API_KEY: this.config.apiKey || "",
          VIDEO_FACTORY_BRIDGE_URL: this.config.bridgeUrl
        },
        shell: false
      });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk: Buffer) => { stdout += maskSecret(chunk.toString(), this.config.apiKey); });
      child.stderr.on("data", (chunk: Buffer) => { stderr += maskSecret(chunk.toString(), this.config.apiKey); });
      child.on("close", (code) => resolve({ ok: code === 0, command, stdout, stderr }));
    });
  }
}

export function createVideoFactoryAdapter(): VideoFactoryAdapter {
  const key = process.env.PIXVERSE_WEB_PROVIDER_API_KEY;
  return new VideoFactoryAdapter({
    videoFactoryPath: process.env.VIDEO_FACTORY_PATH || "/Users/steven-mac2/Documents/VideoFactory",
    bridgeUrl: process.env.VIDEO_FACTORY_BRIDGE_URL || "https://admin666.aurax.one",
    apiKey: key && key !== "replace_with_real_bridge_key" ? key : undefined
  });
}

export async function writeCommandManifest(batchId: string, fileName: string, result: VideoFactoryCommandResult): Promise<string> {
  const filePath = path.join(batchDir(batchId), fileName);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(result, null, 2)}\n`);
  return filePath;
}

export async function copyIfExists(source: string, target: string): Promise<void> {
  if (!existsSync(source)) return;
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, await readFile(source));
}

function remoteLimit(value: number | undefined): number {
  return Math.max(1, Math.min(10, Number(value || 1)));
}

function maskSecret(value: string, apiKey?: string): string {
  return apiKey ? value.split(apiKey).join("***") : value;
}
