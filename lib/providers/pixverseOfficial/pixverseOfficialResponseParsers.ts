export function parsePixVerseOfficialBalanceResponse(response: unknown) {
  return (response as { Resp?: { account_id?: unknown; credit_monthly?: unknown; credit_package?: unknown } })?.Resp || {};
}

export function parsePixVerseOfficialUploadImageResponse(response: unknown) {
  const resp = (response as { Resp?: { img_id?: unknown; img_url?: unknown } })?.Resp || {};
  return {
    providerAssetId: String(resp.img_id || ""),
    providerAssetUrl: String(resp.img_url || "")
  };
}

export function parsePixVerseOfficialImageToVideoResponse(response: unknown) {
  const resp = (response as { Resp?: { video_id?: unknown } })?.Resp || {};
  return { providerTaskId: String(resp.video_id || "") };
}
