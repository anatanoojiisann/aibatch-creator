# Codex Operating Notes

This repository can contain large local runtimes and generated outputs. Work in small phases to avoid Codex reconnecting or WebSocket stream failures.

- Split long tasks into short, verifiable phases.
- Keep tool output small and summarize results.
- Prefer targeted file reads and searches over broad recursive scans.
- Avoid scanning `.local/`, `devspace/`, `logs/`, `output/`, `outputs/`, `profiles/`, `data/`, `.next/`, and `node_modules/`.
- Use `git status --short --untracked-files=normal` for Git checks.
- For logs, read only recent tails or narrow keyword matches.
- Stop and re-scope before running commands likely to produce thousands of lines or run for a long time.
- If Codex shows `408 Request body read timed out`, `stream disconnected before completion`, `failed to send websocket request`, `Broken pipe`, or repeated `Reconnecting`, treat the current thread as overloaded: stop broad reads, verify `.codexignore`, avoid attaching large generated files, and continue in a fresh short thread if reconnecting persists.
- If reconnecting reaches 3/5 or higher, do not run long tools, do not attach screenshots, and do not try to recover the same long chat. Write any needed state to local files, then continue from `CODEX_HANDOFF.md` in a new short thread.
- For Codex reconnecting reports, paste the error text instead of attaching repeated screenshots. Screenshots add image payload to the same overloaded chat and can make reconnecting worse.
- For fresh short threads, start from `CODEX_HANDOFF.md` instead of replaying the full prior conversation.
- If the VideoFactory reconnect watchdog stops a command, read the bounded stdout/stderr tail and runtime diagnostics first, then retry a small batch after restarting the dev server.
- Do not use Codex automations, heartbeat tasks, cron tasks, `list_threads`, or `read_thread` to monitor active Codex chats for reconnecting; this can amplify request size, wake stalled threads, and increase reconnect/resource pressure.
- For long-job health checks, read only local small status files, manifests, or bounded log tails. Do not send automated recovery messages to Codex threads.
- Run image generation in small resumable batches: `scripts/generate_profile_s3_images.py` defaults to 8 pending image jobs with concurrency 1, and `scripts/split_and_generate_social_ad_personas.py` defaults to 5 pending personas with concurrency 1. Use `--all` only outside overloaded Codex chats.
- Prefer `npm run generate:profiles:safe` or `npm run generate:personas:safe` for image work from Codex.
- Do not render generated image grids or local image previews inline in Codex chats during batch work. Report counts, small JSON status, and file paths instead.
- Use `npm run dev` by default. Use `npm run dev:polling` only when filesystem watching is broken, because polling can increase local resource pressure.
