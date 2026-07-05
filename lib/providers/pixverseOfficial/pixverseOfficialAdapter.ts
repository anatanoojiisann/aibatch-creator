import { buildPixVerseBalanceRequest, buildPixVerseImageToVideoRequest, buildPixVerseUploadImageRequest, buildPixVerseVideoStatusRequest } from "@/lib/providers/pixverseOfficial/pixverseOfficialRequestBuilders";
import { normalizePixVerseOfficialError } from "@/lib/providers/pixverseOfficial/pixverseOfficialErrorNormalizer";
import { parsePixVerseOfficialBalanceResponse, parsePixVerseOfficialImageToVideoResponse, parsePixVerseOfficialUploadImageResponse } from "@/lib/providers/pixverseOfficial/pixverseOfficialResponseParsers";
import { parsePixVerseOfficialVideoStatus } from "@/lib/providers/pixverseOfficial/pixverseOfficialStatusParser";
import { formatNetworkError, PROVIDER_REQUEST_TIMEOUT_MS, withTimeoutSignal } from "@/lib/network/request";

type Fetcher = typeof fetch;

export class PixVerseOfficialAdapter {
  readonly providerId = "pixverse_official_api" as const;

  constructor(
    private readonly fetcher: Fetcher = fetch,
    private readonly timeoutMs = PROVIDER_REQUEST_TIMEOUT_MS
  ) {}

  async getCreditBalance() {
    const response = await this.request(buildPixVerseBalanceRequest());
    return { ok: true as const, providerId: this.providerId, balance: parsePixVerseOfficialBalanceResponse(response), rawResponse: response };
  }

  async submitImageToVideo(input: Parameters<typeof buildPixVerseImageToVideoRequest>[0]) {
    const response = await this.request(buildPixVerseImageToVideoRequest(input));
    return { ok: true as const, providerId: this.providerId, ...parsePixVerseOfficialImageToVideoResponse(response), rawResponse: response };
  }

  async uploadImage(image: Blob, fileName: string) {
    const response = await this.request(buildPixVerseUploadImageRequest(image, fileName));
    return {
      ok: true as const,
      providerId: this.providerId,
      ...parsePixVerseOfficialUploadImageResponse(response),
      rawResponse: response
    };
  }

  async getVideoStatus(videoId: string) {
    const response = await this.request(buildPixVerseVideoStatusRequest(videoId));
    return { ok: true as const, providerId: this.providerId, ...parsePixVerseOfficialVideoStatus(response), rawResponse: response };
  }

  private async request(request: { url: string; init: RequestInit }): Promise<any> {
    const timed = withTimeoutSignal(request.init, this.timeoutMs);
    let response: Response;
    try {
      response = await this.fetcher(request.url, timed.init);
    } catch (error) {
      throw new Error(formatNetworkError(error, "PixVerse official API request", this.timeoutMs));
    } finally {
      timed.cancel();
    }
    const data = await response.json().catch(() => ({}));
    const normalized = normalizePixVerseOfficialError(data);
    if (!response.ok || normalized) throw new Error(normalized?.message || `PixVerse official API returned HTTP ${response.status}`);
    return data;
  }
}
