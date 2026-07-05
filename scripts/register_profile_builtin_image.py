#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import struct
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


ROOT_DIR = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE_ROOT = Path.home() / ".codex" / "generated_images"
OUTPUT_ROOT = ROOT_DIR / "output"
SUCCESS_LOG_PATH = OUTPUT_ROOT / "success.jsonl"
ERROR_LOG_PATH = OUTPUT_ROOT / "error.jsonl"


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def latest_image(source_root: Path) -> Path:
    candidates = [
        path
        for path in source_root.rglob("*")
        if path.is_file() and path.suffix.lower() in {".png", ".jpg", ".jpeg", ".webp"}
    ]
    if not candidates:
        raise SystemExit(f"No generated images found under {source_root}")
    return max(candidates, key=lambda path: path.stat().st_mtime)


def detect_image_format(data: bytes) -> str:
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png"
    if data.startswith(b"\xff\xd8\xff"):
        return "jpeg"
    if data.startswith(b"RIFF") and data[8:12] == b"WEBP":
        return "webp"
    return "unknown"


def png_dimensions(data: bytes) -> str:
    if data.startswith(b"\x89PNG\r\n\x1a\n") and len(data) >= 24:
        width, height = struct.unpack(">II", data[16:24])
        return f"{width}x{height}"
    return ""


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    rows: list[dict[str, Any]] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        value = json.loads(line)
        if isinstance(value, dict):
            rows.append(value)
    return rows


def write_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        "".join(json.dumps(row, ensure_ascii=False, separators=(",", ":")) + "\n" for row in rows),
        encoding="utf-8",
    )


def upsert_success(record: dict[str, Any]) -> None:
    rows = [row for row in read_jsonl(SUCCESS_LOG_PATH) if row.get("job_id") != record["job_id"]]
    rows.append(record)
    rows.sort(key=lambda row: str(row.get("job_id", "")))
    write_jsonl(SUCCESS_LOG_PATH, rows)


def remove_error(job_id: str) -> None:
    rows = [row for row in read_jsonl(ERROR_LOG_PATH) if row.get("job_id") != job_id]
    write_jsonl(ERROR_LOG_PATH, rows)


def main() -> int:
    parser = argparse.ArgumentParser(description="Register a built-in image2 result for output/{character}/{scene}.png.")
    parser.add_argument("character_name")
    parser.add_argument("scene_id")
    parser.add_argument("--source")
    parser.add_argument("--source-root", default=str(DEFAULT_SOURCE_ROOT))
    parser.add_argument("--retry-count", type=int, default=0)
    args = parser.parse_args()

    image_path = OUTPUT_ROOT / args.character_name / f"{args.scene_id}.png"
    metadata_path = OUTPUT_ROOT / args.character_name / f"{args.scene_id}.json"
    if not metadata_path.exists():
        raise SystemExit(f"Metadata not found: {metadata_path}")

    source = Path(args.source).expanduser() if args.source else latest_image(Path(args.source_root).expanduser())
    if not source.exists():
        raise SystemExit(f"Source image not found: {source}")

    data = source.read_bytes()
    image_format = detect_image_format(data)
    if image_format == "unknown":
        raise SystemExit(f"Source is not a recognized image: {source}")

    image_path.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, image_path)

    metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    metadata.update(
        {
            "status": "success",
            "generation_mode": "built_in_image2",
            "model": "codex_builtin_image2",
            "quality": "built_in",
            "image_path": str(image_path.relative_to(ROOT_DIR)),
            "metadata_path": str(metadata_path.relative_to(ROOT_DIR)),
            "source_generated_image": str(source),
            "completed_at": utc_now(),
            "error_type": "",
            "error_message": "",
            "retry_count": args.retry_count,
            "image_format": image_format,
            "dimensions": png_dimensions(data),
            "bytes": len(data),
            "sha256": hashlib.sha256(data).hexdigest(),
        }
    )
    metadata_path.write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    upsert_success(metadata)
    remove_error(str(metadata["job_id"]))
    print(json.dumps({"job_id": metadata["job_id"], "image_path": metadata["image_path"], "bytes": len(data)}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
