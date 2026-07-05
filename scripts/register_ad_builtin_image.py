#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import shutil
import struct
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


ROOT_DIR = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = ROOT_DIR / "outputs" / "social_ad_personas_100_downloads"
DEFAULT_SOURCE_ROOT = Path.home() / ".codex" / "generated_images"
MANIFEST_FIELDS = [
    "persona_id",
    "name",
    "image_id",
    "slot",
    "output_path",
    "model",
    "quality",
    "size",
    "prompt_hash",
    "status",
    "error_type",
    "error_message",
    "created_at",
    "completed_at",
]


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def rel(path: Path) -> str:
    try:
        return str(path.resolve().relative_to(ROOT_DIR))
    except ValueError:
        return str(path)


def safe_folder_name(persona: dict[str, Any]) -> str:
    import re

    persona_id = str(persona.get("persona_id") or "unknown").strip() or "unknown"
    name = str(persona.get("name") or "Character").strip()
    name_slug = re.sub(r"[^A-Za-z0-9]+", "_", name).strip("_") or "Character"
    return f"{persona_id}_{name_slug}"


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


def dimensions(data: bytes) -> str:
    if data.startswith(b"\x89PNG\r\n\x1a\n") and len(data) >= 24:
        width, height = struct.unpack(">II", data[16:24])
        return f"{width}x{height}"
    return ""


def read_manifest(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    with path.open(newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def write_manifest(path: Path, rows: list[dict[str, Any]]) -> None:
    rows = sorted(rows, key=lambda row: (row.get("persona_id", ""), row.get("slot", "")))
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=MANIFEST_FIELDS)
        writer.writeheader()
        for row in rows:
            writer.writerow({field: row.get(field, "") for field in MANIFEST_FIELDS})


def main() -> int:
    parser = argparse.ArgumentParser(description="Register the latest built-in generated image for one social-ad persona scene.")
    parser.add_argument("persona_id")
    parser.add_argument("slot")
    parser.add_argument("--output", default=str(DEFAULT_OUTPUT))
    parser.add_argument("--source")
    parser.add_argument("--source-root", default=str(DEFAULT_SOURCE_ROOT))
    parser.add_argument("--model", default="builtin-imagegen")
    parser.add_argument("--skip", action="store_true", help="Mark this scene skipped without copying an image.")
    parser.add_argument("--reason", default="blocked_by_builtin_image_generation")
    args = parser.parse_args()

    output_root = Path(args.output).expanduser()
    if not output_root.is_absolute():
        output_root = ROOT_DIR / output_root
    persona_dirs = sorted(output_root.glob(f"{args.persona_id}_*"))
    if not persona_dirs:
        raise SystemExit(f"Persona folder not found for {args.persona_id} under {output_root}")
    persona_dir = persona_dirs[0]
    persona_path = persona_dir / "persona.json"
    scene_path = persona_dir / f"{args.slot}.json"
    if not persona_path.exists() or not scene_path.exists():
        raise SystemExit(f"Missing persona or scene JSON for {args.persona_id} {args.slot}")

    persona = json.loads(persona_path.read_text(encoding="utf-8"))
    scene_record = json.loads(scene_path.read_text(encoding="utf-8"))
    if args.skip:
        completed_at = utc_now()
        record = dict(scene_record)
        record.update(
            {
                "status": "skipped",
                "model": args.model,
                "error_type": "builtin_image_generation_skipped",
                "error_message": args.reason,
                "completed_at": completed_at,
            }
        )
        scene_path.write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        manifest_path = output_root / "manifest.csv"
        rows = [
            row
            for row in read_manifest(manifest_path)
            if not (row.get("persona_id") == args.persona_id and row.get("slot") == args.slot)
        ]
        rows.append(record)
        write_manifest(manifest_path, rows)
        print(json.dumps({"status": "skipped", "scene_path": rel(scene_path)}, ensure_ascii=False))
        return 0

    source = Path(args.source).expanduser() if args.source else latest_image(Path(args.source_root).expanduser())
    if not source.exists() or source.stat().st_size <= 0:
        raise SystemExit(f"Source image not found or empty: {source}")
    data = source.read_bytes()
    image_format = detect_image_format(data)
    if image_format == "unknown":
        raise SystemExit(f"Source is not a recognized image: {source}")

    target = persona_dir / f"{args.slot}.png"
    shutil.copy2(source, target)
    completed_at = utc_now()
    record = dict(scene_record)
    record.update(
        {
            "status": "success",
            "model": args.model,
            "output_path": rel(target),
            "error_type": "",
            "error_message": "",
            "completed_at": completed_at,
            "source_generated_image": str(source),
            "image_format": image_format,
            "dimensions": dimensions(data),
            "bytes": len(data),
            "sha256": hashlib.sha256(data).hexdigest(),
        }
    )
    scene_path.write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    manifest_path = output_root / "manifest.csv"
    rows = [
        row
        for row in read_manifest(manifest_path)
        if not (row.get("persona_id") == args.persona_id and row.get("slot") == args.slot)
    ]
    rows.append(record)
    write_manifest(manifest_path, rows)

    all_scene_records: list[dict[str, Any]] = []
    for path in sorted(persona_dir.glob("*.json")):
        if path.name in {"persona.json", "metadata.json"}:
            continue
        all_scene_records.append(json.loads(path.read_text(encoding="utf-8")))
    statuses = {str(item.get("status")) for item in all_scene_records}
    metadata = {
        "persona_id": persona["persona_id"],
        "name": persona["name"],
        "updated_at": completed_at,
        "status": "success" if statuses == {"success"} and len(all_scene_records) == 2 else "partial",
        "persona_json": rel(persona_path),
        "outputs": {item["slot"]: item.get("output_path") for item in all_scene_records},
        "records": all_scene_records,
    }
    (persona_dir / "metadata.json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": "success", "output_path": rel(target), "metadata_path": rel(persona_dir / "metadata.json")}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
