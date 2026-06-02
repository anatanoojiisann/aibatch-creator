export function normalizePixVerseOfficialError(response: unknown): { errorCode: string; message: string } | undefined {
  const data = response as { ErrCode?: unknown; ErrMsg?: unknown };
  if (data?.ErrCode === 0) return undefined;
  return {
    errorCode: `PIXVERSE_OFFICIAL_${String(data?.ErrCode ?? "UNKNOWN")}`,
    message: String(data?.ErrMsg || "PixVerse official API request failed.")
  };
}
