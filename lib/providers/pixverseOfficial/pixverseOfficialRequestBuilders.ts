import { randomUUID } from "node:crypto";

export const pixverseOfficialBaseUrl = () => (process.env.PIXVERSE_OFFICIAL_BASE_URL || "https://app-api.pixverse.ai").replace(/\/$/, "");

export function pixverseOfficialHeaders(apiKey = process.env.PIXVERSE_OFFICIAL_API_KEY || ""): Record<string, string> {
  return {
    "API-KEY": apiKey,
    "Ai-trace-id": randomUUID()
  };
}

export function buildPixVerseBalanceRequest(apiKey?: string, baseUrl = pixverseOfficialBaseUrl()): { url: string; init: RequestInit } {
  return {
    url: `${baseUrl.replace(/\/$/, "")}/openapi/v2/account/balance`,
    init: { method: "GET", headers: pixverseOfficialHeaders(apiKey) }
  };
}

export function buildPixVerseImageToVideoRequest(input: {
  imgId: string | number;
  prompt: string;
  model?: string;
  duration?: number;
  quality?: string;
  aspectRatio?: string;
  motionMode?: string;
  negativePrompt?: string;
}, apiKey?: string): { url: string; init: RequestInit } {
  return {
    url: `${pixverseOfficialBaseUrl()}/openapi/v2/video/img/generate`,
    init: {
      method: "POST",
      headers: { ...pixverseOfficialHeaders(apiKey), "Content-Type": "application/json" },
      body: JSON.stringify({
        img_id: Number(input.imgId),
        prompt: input.prompt,
        model: input.model || "v6",
        duration: input.duration || 5,
        quality: input.quality || "540p",
        ...(input.aspectRatio ? { aspect_ratio: input.aspectRatio } : {}),
        motion_mode: input.motionMode || "normal",
        ...(input.negativePrompt ? { negative_prompt: input.negativePrompt } : {})
      })
    }
  };
}

export function buildPixVerseUploadImageRequest(image: Blob, fileName: string, apiKey?: string): { url: string; init: RequestInit } {
  const form = new FormData();
  form.append("image", image, fileName);
  return {
    url: `${pixverseOfficialBaseUrl()}/openapi/v2/image/upload`,
    init: { method: "POST", headers: pixverseOfficialHeaders(apiKey), body: form }
  };
}

export function buildPixVerseVideoStatusRequest(videoId: string | number, apiKey?: string): { url: string; init: RequestInit } {
  return {
    url: `${pixverseOfficialBaseUrl()}/openapi/v2/video/result/${encodeURIComponent(String(videoId))}`,
    init: { method: "GET", headers: pixverseOfficialHeaders(apiKey) }
  };
}
