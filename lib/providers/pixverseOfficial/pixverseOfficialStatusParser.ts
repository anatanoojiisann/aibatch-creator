export type PixVerseOfficialVideoStatus = {
  status: "video_succeeded" | "video_generating" | "video_failed" | "video_rejected";
  providerRawStatus: unknown;
  videoUrl?: string;
};

export function parsePixVerseOfficialVideoStatus(response: unknown): PixVerseOfficialVideoStatus {
  const resp = (response as { Resp?: { status?: unknown; url?: unknown } })?.Resp || {};
  if (resp.status === 1) return { status: "video_succeeded", providerRawStatus: resp.status, videoUrl: String(resp.url || "") || undefined };
  if (resp.status === 5) return { status: "video_generating", providerRawStatus: resp.status };
  if (resp.status === 7) return { status: "video_rejected", providerRawStatus: resp.status };
  return { status: "video_failed", providerRawStatus: resp.status };
}
