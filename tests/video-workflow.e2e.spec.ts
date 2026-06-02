import { expect, test } from "@playwright/test";

test("keeps mock video separate from real success", async ({ page }) => {
  await page.goto("/video-workflow");

  await page.getByLabel("Topic").fill("Alien playing guitar");
  await page.getByLabel("Persona").fill("alien");
  await page.getByLabel("Count").fill("3");
  await page.getByRole("button", { name: "Create Batch + Generate Prompts" }).click();

  await expect(page.getByText("Alien playing guitar concept 1")).toBeVisible();
  await page.getByRole("button", { name: "Export Prompt Dir" }).click();
  await expect(page.getByText("export prompt dir complete")).toBeVisible();

  await page.getByRole("button", { name: "Generate Reference Images" }).click();
  await expect(page.getByText("sync images complete")).toBeVisible();
  await expect(page.getByText("Reference images ready for preview.")).toBeVisible();
  await expect(page.getByText("localPath:").first()).toBeVisible();
  await expect(page.getByText("previewUrl:").first()).toBeVisible();
  await expect(page.locator("img").first()).toBeVisible();

  await page.getByRole("button", { name: "Approve First Image + Mock Upload" }).click();
  await expect(page.getByText("upload public images complete")).toBeVisible();
  await expect(page.getByText("https://your-domain.example/assets/")).toBeVisible();

  await page.getByRole("button", { name: "Generate Mock / Dry-run Video" }).click();
  await expect(page.getByText("submit videos complete")).toBeVisible();
  await expect(page.getByText("https://your-domain.example/videos/")).toBeVisible();
  await expect(page.getByText("video_mocked")).toBeVisible();
  await expect(page.getByText("No real video has been generated yet. This is a mock placeholder result.")).toBeVisible();

  await expect(page.getByRole("button", { name: "Send Successful Videos to Watermark" })).toBeDisabled();
  await page.getByLabel("Video generation mode").selectOption("real");
  await expect(page.getByText("Real video generation requires a real public HTTPS image URL.")).toBeVisible();
});
