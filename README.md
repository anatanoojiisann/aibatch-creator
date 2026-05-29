# AI Batch Creator

Standalone AI video batch workflow app that integrates VideoFactory as an external CLI provider.

## Architecture

- This project lives at `/Users/steven-mac2/Documents/aibatch-creator`.
- VideoFactory remains external at `/Users/steven-mac2/Documents/VideoFactory`.
- The app calls VideoFactory with `child_process` using `VIDEO_FACTORY_PATH`.
- Batch state is stored in `storage/video-batches/<batchId>/batch_manifest.json`.
- Default behavior is dry-run/mock mode. Real remote PixVerse submission is blocked unless explicitly confirmed and configured.

## Commands

```bash
npm install
npm run lint
npm run typecheck
npm run build
npm run dev
npm run test:workflow
```

Open `/video-workflow` in the local dev server.
