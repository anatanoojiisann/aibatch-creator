# VideoFactory Capability Audit

Generated: 2026-05-29

## Summary

- Can VideoFactory run? Yes.
- Can it accept aibatch prompt-dir? Yes.
- Can dry-run submit-images work? Yes.
- Can real image generation work? Not tested.
- Can sync-relax-images download images? Not tested in this audit run; existing previously synced images are present.
- Current blocker: `PIXVERSE_WEB_PROVIDER_API_KEY` is not available in the shell, so real Aurax/PixVerse image generation was skipped.

## Commands Executed

All commands were run with API key output masked. No real key was printed.

### Phase 1 - Inspect VideoFactory

```bash
cd /Users/steven-mac2/Documents/VideoFactory
pwd
ls -la
cat package.json
find scripts -maxdepth 2 -type f | sort
find config -maxdepth 2 -type f | sort
find personas -maxdepth 2 -type f | sort
find head -maxdepth 2 -type f | sort
test -d node_modules && echo node_modules_present || echo node_modules_missing
test -f start.sh && echo start_sh_present || echo start_sh_missing
test -f config/factory.config.json && echo factory_config_present || echo factory_config_missing
test -f scripts/submit-images.mjs && echo submit_images_present || echo submit_images_missing
test -f scripts/sync-relax-images.mjs && echo sync_relax_images_present || echo sync_relax_images_missing
test -f scripts/submit-videos.mjs && echo submit_videos_present || echo submit_videos_missing
```

### Phase 2 - Local Check

```bash
cd /Users/steven-mac2/Documents/VideoFactory
npm install
npm run check
```

### Phase 3 - Environment Check

```bash
echo "VIDEO_FACTORY_PATH=/Users/steven-mac2/Documents/VideoFactory"
echo "PIXVERSE key present? $(if [ -n "$PIXVERSE_WEB_PROVIDER_API_KEY" ]; then echo yes; else echo no; fi)"
echo "Bridge URL candidate: https://admin666.aurax.one"
```

### Phase 4 - Inspect aibatch-creator Prompt Dir

```bash
cd /Users/steven-mac2/Documents/aibatch-creator
pwd
ls -la
latest=$(ls -td storage/video-batches/batch_* | head -1)
echo "$latest"
find "$latest" -maxdepth 5 -type f | sort
find "$latest/prompt-dir" -type f | sort
find "$latest/prompt-dir" -type f -name "*.txt" | wc -l
cd "$latest/prompt-dir" && pwd
```

### Phase 5 - VideoFactory Dry-run Submit Images

```bash
cd /Users/steven-mac2/Documents/VideoFactory
PROMPT_DIR="/Users/steven-mac2/Documents/aibatch-creator/storage/video-batches/batch_20260529085010_uz1ber/prompt-dir"
npm run submit-images -- \
  --prompt-dir "$PROMPT_DIR" \
  --dry-run \
  --limit 1 \
  --model-limit 1
```

### Phase 6 - Real Image Generation

Skipped. `PIXVERSE_WEB_PROVIDER_API_KEY` was not present in the shell.

### Phase 7 - sync-relax-images

Skipped. No real image-generation job was executed in this audit, and no current known remote batch was selected for sync.

### Phase 8 - Verify Existing Downloaded Images

```bash
cd /Users/steven-mac2/Documents/VideoFactory
find output -type f \( -iname "*.png" -o -iname "*.jpg" -o -iname "*.jpeg" -o -iname "*.webp" \) -print | tail -20
find output -type f \( -iname "*.png" -o -iname "*.jpg" -o -iname "*.jpeg" -o -iname "*.webp" \) -exec stat -f '%m %N' {} + | sort -nr | head -5
file output/VideoFactory-Relax-Images-2026-05-27/Yuna/seedream-4.0/030_yuna_05-prompt-5-1.jpg
ls -lh output/VideoFactory-Relax-Images-2026-05-27/Yuna/seedream-4.0/030_yuna_05-prompt-5-1.jpg
```

## Results

### VideoFactory Shape

- `package.json` exists.
- Available npm scripts:
  - `make-day`
  - `make-today`
  - `ai-prompts`
  - `submit-images`
  - `submit-videos`
  - `sync-relax-images`
  - `check`
- Required scripts exist:
  - `scripts/submit-images.mjs`
  - `scripts/sync-relax-images.mjs`
  - `scripts/submit-videos.mjs`
- `config/factory.config.json` exists.
- Persona files exist:
  - `personas/Aiko.md`
  - `personas/Elise.md`
  - `personas/Lune.md`
  - `personas/Nya.md`
  - `personas/Vera.md`
  - `personas/Yuna.md`
  - `personas/personas.json`
- Head image files exist:
  - `head/Aiko.png`
  - `head/Elise.png`
  - `head/Lune.png`
  - `head/Nya.png`
  - `head/Vera.png`
  - `head/Yuna.png`
- `start.sh` exists.
- `node_modules` was initially missing.
- `start.sh` bridge API key value is placeholder, not a real embedded key.

### npm install

Result: succeeded.

Output summary:

```text
up to date, audited 1 package
found 0 vulnerabilities
```

Note: running `npm install` created or refreshed npm install artifacts in the VideoFactory folder.

### npm run check

Result: passed.

Output summary:

```text
VideoFactory config
- Aurax bridge: http://127.0.0.1:8787
- Bridge API key env: PIXVERSE_WEB_PROVIDER_API_KEY
- Off-peak: 1
- Required membership: premium
- Idle image models: qwen-image, gemini-2.5-flash, gemini-3.1-flash, seedream-4.0

OK Lune -> head/Lune.png
OK Nya -> head/Nya.png
OK Vera -> head/Vera.png
OK Elise -> head/Elise.png
OK Yuna -> head/Yuna.png
OK Aiko -> head/Aiko.png
```

Important finding: `factory.config.json` currently defaults the bridge URL to `http://127.0.0.1:8787`. The intended remote bridge candidate is `https://admin666.aurax.one`. aibatch-creator should pass `--bridge-url` explicitly for remote commands.

### Environment

Result:

```text
VIDEO_FACTORY_PATH=/Users/steven-mac2/Documents/VideoFactory
PIXVERSE key present? no
Bridge URL candidate: https://admin666.aurax.one
```

Real remote image generation was not tested because `PIXVERSE_WEB_PROVIDER_API_KEY` is missing.

### aibatch-creator Prompt Dir

Latest batch found:

```text
/Users/steven-mac2/Documents/aibatch-creator/storage/video-batches/batch_20260529085010_uz1ber
```

Relevant files:

```text
batch_manifest.json
final_report.md
image-url-map.json
prompt-dir/alien/01.txt
prompt-dir/alien/02.txt
video-factory-output/item_001.png
video-factory-output/item_002.png
video_factory_image_result.json
video_factory_sync_result.json
video_factory_video_result.json
```

Prompt dir:

```text
/Users/steven-mac2/Documents/aibatch-creator/storage/video-batches/batch_20260529085010_uz1ber/prompt-dir
```

Prompt file count: 2.

The prompt files contain `VIDEO_BATCH_ITEM_ID`, so VideoFactory can map prompts back to aibatch item IDs.

### Dry-run submit-images

Result: succeeded.

Command:

```bash
npm run submit-images -- \
  --prompt-dir "/Users/steven-mac2/Documents/aibatch-creator/storage/video-batches/batch_20260529085010_uz1ber/prompt-dir" \
  --dry-run \
  --limit 1 \
  --model-limit 1
```

Output:

```text
Done. Image submitted=1, tasks=1, models=1, dryRun=true
```

VideoFactory wrote result JSON:

```text
/Users/steven-mac2/Documents/VideoFactory/runs/2026-05-29/from-prompt-dir/results/image-submissions.json
```

Result JSON summary:

```json
{
  "source": "prompt-dir:/Users/steven-mac2/Documents/aibatch-creator/storage/video-batches/batch_20260529085010_uz1ber/prompt-dir",
  "dryRun": true,
  "batch": true,
  "bridgeBaseUrl": "http://127.0.0.1:8787",
  "submitted": 1,
  "models": ["qwen-image"],
  "submissions": [
    {
      "taskId": "001_alien_01",
      "itemId": "item_001",
      "persona": "alien",
      "model": "qwen-image",
      "dryRun": true
    }
  ]
}
```

No real remote jobs were submitted.

### Real submit-images

Skipped.

Reason:

```text
PIXVERSE_WEB_PROVIDER_API_KEY is missing.
```

### sync-relax-images

Skipped in this audit.

Reason: no real submit-images job was executed in this audit run. Running sync would require bridge access and an API key.

### Existing Downloaded Images

Existing VideoFactory output images are present under:

```text
/Users/steven-mac2/Documents/VideoFactory/output/VideoFactory-Relax-Images-2026-05-27/
/Users/steven-mac2/Documents/VideoFactory/output/VideoFactory-Relax-Images-2026-05-20-part-1-2/
```

Existing sync manifest:

```text
/Users/steven-mac2/Documents/VideoFactory/output/relax-image-sync.json
```

It references:

```json
{
  "bridgeBaseUrl": "https://admin666.aurax.one",
  "results": "runs/2026-05-27/from-prompt-dir/results/image-submissions.json",
  "deleteRemote": true,
  "synced": [
    {
      "id": "videofactory-2026-05-27-1779894092521",
      "status": "completed",
      "taskCount": 120,
      "succeeded": 120,
      "failed": 0,
      "zipBytes": 112445004,
      "deletedRemote": true
    }
  ]
}
```

Sample verified image:

```text
output/VideoFactory-Relax-Images-2026-05-27/Yuna/seedream-4.0/030_yuna_05-prompt-5-1.jpg
JPEG image data, 1080x1920
683K
```

The sample appears to be a real generated image file, not an empty placeholder.

## Output Files Found

VideoFactory:

```text
/Users/steven-mac2/Documents/VideoFactory/runs/2026-05-29/from-prompt-dir/results/image-submissions.json
/Users/steven-mac2/Documents/VideoFactory/runs/2026-05-29/from-prompt-dir/image-submit-log.jsonl
/Users/steven-mac2/Documents/VideoFactory/output/relax-image-sync.json
/Users/steven-mac2/Documents/VideoFactory/output/VideoFactory-Relax-Images-2026-05-27/manifest.json
/Users/steven-mac2/Documents/VideoFactory/output/VideoFactory-Relax-Images-2026-05-27/Yuna/seedream-4.0/030_yuna_05-prompt-5-1.jpg
```

aibatch-creator:

```text
/Users/steven-mac2/Documents/aibatch-creator/storage/video-batches/batch_20260529085010_uz1ber/batch_manifest.json
/Users/steven-mac2/Documents/aibatch-creator/storage/video-batches/batch_20260529085010_uz1ber/prompt-dir/alien/01.txt
/Users/steven-mac2/Documents/aibatch-creator/storage/video-batches/batch_20260529085010_uz1ber/prompt-dir/alien/02.txt
```

## Integration Recommendation

### Answers

1. Can VideoFactory run locally?
   - Yes.
   - Evidence: `npm install` succeeded and `npm run check` passed.

2. Can VideoFactory accept aibatch-creator prompt-dir?
   - Yes.
   - Evidence: `npm run submit-images -- --prompt-dir ... --dry-run --limit 1 --model-limit 1` succeeded and read the aibatch prompt dir.

3. Can VideoFactory submit image generation dry-run?
   - Yes.
   - Evidence: dry-run reported `Image submitted=1, tasks=1, models=1, dryRun=true` and wrote result JSON.

4. Can VideoFactory submit real image generation?
   - Not tested.
   - Evidence: `PIXVERSE_WEB_PROVIDER_API_KEY` was missing from the shell.

5. Can VideoFactory sync real generated images?
   - Not tested in this run.
   - Evidence: sync needs bridge access and an API key. Existing prior sync output proves the command has previously downloaded image archives.

6. Where does VideoFactory save generated images?
   - Existing downloaded images are under:
     `/Users/steven-mac2/Documents/VideoFactory/output/VideoFactory-Relax-Images-YYYY-MM-DD/...`
   - Sync manifest is:
     `/Users/steven-mac2/Documents/VideoFactory/output/relax-image-sync.json`
   - Submit result JSON is:
     `/Users/steven-mac2/Documents/VideoFactory/runs/<date-or-batch-id>/from-prompt-dir/results/image-submissions.json`

7. How should aibatch-creator import generated images?
   - Export aibatch prompt-dir.
   - Run VideoFactory `submit-images` through child_process.
   - For first real mode, pass:
     - `--prompt-dir <aibatch prompt-dir>`
     - `--bridge-url https://admin666.aurax.one`
     - `--batch-id <aibatch batchId>`
     - `--limit 1`
     - `--model-limit 1`
   - Run VideoFactory `sync-relax-images` only after a real submit succeeds.
   - Prefer passing `--results runs/<batchId>/from-prompt-dir/results/image-submissions.json` and `--bridge-url https://admin666.aurax.one` so sync targets the exact archive returned by submit.
   - Copy selected downloaded images into:
     `/Users/steven-mac2/Documents/aibatch-creator/storage/video-batches/<batchId>/video-factory-output/`
   - Update `batch_manifest.json`:
     - `referenceImage.status = ready_for_preview`
     - `referenceImage.localPath = <copied file path>`
     - `referenceImage.previewUrl = <aibatch preview route>`
   - UI displays `previewUrl`.

8. What code changes are needed in aibatch-creator?
   - `lib/integrations/videofactory/videoFactoryAdapter.ts`
     - Add real-mode command options for `--bridge-url`, `--batch-id`, result path discovery, and safe masked command logging.
   - `app/api/video-batches/submit-images/route.ts`
     - Add real mode guarded by explicit confirmation, key presence, `limit=1`, and `modelLimit=1`.
   - `app/api/video-batches/sync-images/route.ts`
     - Add real sync mode that reads VideoFactory result JSON and imports files from `VideoFactory/output`.
   - `app/api/video-batches/image-preview/route.ts`
     - Recommended separate preview route for local copied files instead of overloading sync route.
   - `app/video-workflow/page.tsx`
     - Add a clearly gated "Real VideoFactory Image Generation" option in Step 2.

9. What config is needed?
   - `VIDEO_FACTORY_PATH=/Users/steven-mac2/Documents/VideoFactory`
   - `PIXVERSE_WEB_PROVIDER_API_KEY=<masked real key>`
   - `VIDEO_FACTORY_BRIDGE_URL=https://admin666.aurax.one`
   - `IMAGE_GENERATION_MODE=mock|videofactory_dry_run|videofactory_real`

10. What is the safest first real integration?
   - Add Real Image Generation mode only.
   - Require explicit UI confirmation.
   - Default to `limit=1` and `modelLimit=1`.
   - Pass `--batch-id <aibatch batchId>`.
   - Pass `--bridge-url https://admin666.aurax.one`.
   - Do not add real video generation yet.
   - Do not add real watermark yet.
   - Do not delete remote or local images in the first real integration.

## Risks

- Credit consumption: real submit-images can consume PixVerse/Aurax credits.
- Bridge auth: missing or invalid `PIXVERSE_WEB_PROVIDER_API_KEY` blocks real remote work.
- Bridge URL mismatch: VideoFactory config defaults to `http://127.0.0.1:8787`; aibatch should pass `--bridge-url`.
- Output mapping ambiguity: downloaded archive filenames may not directly map to aibatch item IDs unless metadata/result JSON is used.
- Sync date mismatch: `--date today` can miss jobs if timezone/date labels differ.
- Duplicate output files: repeated syncs may reuse existing zips or output folders.
- Public HTTPS still needed for video generation: synced local images are only previews until uploaded to a public HTTPS URL.

## Next Recommended Codex Task

Implement "Real VideoFactory Image Generation" mode in aibatch-creator Step 2.

Requirements:

1. Add `IMAGE_GENERATION_MODE=mock|videofactory_dry_run|videofactory_real` to `.env.example`.
2. Update `VideoFactoryAdapter.submitImages()` to support:
   - `--bridge-url`
   - `--batch-id`
   - masked API key logging
   - real mode only with `limit=1` and `modelLimit=1` unless explicitly confirmed.
3. Update `/api/video-batches/submit-images` to block real mode unless:
   - `PIXVERSE_WEB_PROVIDER_API_KEY` is present
   - user confirmation is true
   - `limit=1`
   - `modelLimit=1`
4. Update `/api/video-batches/sync-images` to optionally run real VideoFactory sync with:
   - `--results runs/<batchId>/from-prompt-dir/results/image-submissions.json`
   - `--bridge-url https://admin666.aurax.one`
5. Add a dedicated image preview route that serves copied local files from aibatch storage.
6. Keep mock mode as the default.
7. Do not add real video generation or remote deletion in this task.
