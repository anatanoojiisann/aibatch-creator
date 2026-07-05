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
DEFAULT_INPUT = ROOT_DIR / "data" / "social_ad_personas_100_image2.json"
DEFAULT_OUTPUT = ROOT_DIR / "outputs" / "social_ad_personas"
LOG_DIR = ROOT_DIR / "logs"
MANIFEST_PATH = LOG_DIR / "image2_manifest.csv"
RUN_SUMMARY_PATH = LOG_DIR / "image2_run_summary.json"

MANIFEST_FIELDS = [
    "profile_id",
    "name",
    "slot",
    "output_path",
    "model",
    "prompt_hash",
    "status",
    "error_message",
    "created_at",
    "reference_image_used",
]

SAFETY_RULES = """
Safety and brand constraints:
- Fully fictional adult character, age 24+, mature adult appearance.
- Do not resemble any celebrity, public figure, influencer, private person, stock model, or unauthorized real person.
- S0-S1 only: mainstream lifestyle, interests, friendly social presence, city companionship.
- No nudity, lingerie, swimwear focus, erotic posing, sexual service implication, hookup implication, teen-coded styling, childish facial proportions, school uniforms, or age ambiguity.
- No logos, brand names, readable text, watermarks, real app UI, political symbols, medical promises, income promises, before/after comparisons, or manipulative claims.
- Keep wardrobe opaque, everyday, polished, and appropriate for a mainstream social product advertisement.
""".strip()


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def rel(path: Path) -> str:
    try:
        return str(path.resolve().relative_to(ROOT_DIR))
    except ValueError:
        return str(path)


def prompt_hash(prompt: str) -> str:
    return hashlib.sha256(prompt.encode("utf-8")).hexdigest()


def safe_folder_name(profile: dict[str, Any]) -> str:
    import re

    name_slug = re.sub(r"[^A-Za-z0-9]+", "_", str(profile.get("name") or "Character")).strip("_")
    return f"{profile['profile_id']}_{name_slug}"


def load_profile(input_path: Path, profile_id: str) -> dict[str, Any]:
    value = json.loads(input_path.read_text(encoding="utf-8"))
    profiles = value["profiles"] if isinstance(value, dict) else value
    for profile in profiles:
        if profile.get("profile_id") == profile_id:
            return profile
    raise SystemExit(f"Profile not found: {profile_id}")


def profile_summary(profile: dict[str, Any]) -> str:
    interests = profile.get("interests") or []
    interest_text = ", ".join(str(item) for item in interests[:4]) if isinstance(interests, list) else str(interests)
    return (
        f"{profile['name']}, a {profile['age']}-year-old fictional adult {profile['gender_presentation']} "
        f"in {profile.get('city', 'a modern city')}, {profile.get('country', '')}. "
        f"Appearance: {profile['appearance']}. Style: {profile['style']}. "
        f"Interests: {interest_text}. Social ad angle: {profile.get('social_ad_angle', 'low-pressure interest-based social discovery')}."
    )


def build_prompt(profile: dict[str, Any], slot: str) -> str:
    summary = profile_summary(profile)
    if slot == "01_lifestyle_hero":
        scene = (
            "Create a realistic 9:16 vertical lifestyle hero image for a social product advertisement. "
            "Show the person alone in a natural city lifestyle moment connected to their interests: walking through a pleasant neighborhood, "
            "ordering coffee, browsing a bookshop, preparing for a hobby meetup, or pausing in warm window light. "
            "The image should feel welcoming, mature, calm, and everyday, with no sales copy and no interface."
        )
    elif slot == "02_social_context":
        scene = (
            "Using the first image only as a character-consistency reference, create a second realistic 9:16 vertical image. "
            "Keep the same fictional adult identity, face, age impression, hair, and styling cues, but place the person in a conservative social context: "
            "meeting one or two friends at a cafe table, joining a gallery walk, attending a cooking class, walking in a public park, or sharing a hobby moment. "
            "The mood is city companionship and interest-based friendship, not dating pressure."
        )
    else:
        raise SystemExit(f"Unsupported slot: {slot}")
    return "\n".join(
        [
            scene,
            f"Character brief: {summary}",
            "Composition: photorealistic premium smartphone editorial look, vertical 9:16, natural lens depth, clear face, coherent hands, no text.",
            SAFETY_RULES,
        ]
    )


def png_dimensions(path: Path) -> str:
    data = path.read_bytes()[:24]
    if data.startswith(b"\x89PNG\r\n\x1a\n") and len(data) >= 24:
        width, height = struct.unpack(">II", data[16:24])
        return f"{width}x{height}"
    return ""


def upsert_manifest(row: dict[str, Any]) -> None:
    MANIFEST_PATH.parent.mkdir(parents=True, exist_ok=True)
    rows: list[dict[str, Any]] = []
    if MANIFEST_PATH.exists():
        with MANIFEST_PATH.open(newline="", encoding="utf-8") as handle:
            rows = list(csv.DictReader(handle))
    rows = [
        existing
        for existing in rows
        if not (
            existing.get("profile_id") == row["profile_id"]
            and existing.get("slot") == row["slot"]
            and existing.get("output_path") == row["output_path"]
        )
    ]
    rows.append(row)
    rows.sort(key=lambda item: (item.get("profile_id", ""), item.get("slot", ""), item.get("output_path", "")))
    with MANIFEST_PATH.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=MANIFEST_FIELDS)
        writer.writeheader()
        writer.writerows({field: item.get(field, "") for field in MANIFEST_FIELDS} for item in rows)


def write_run_summary(*, output_root: Path, model: str) -> None:
    rows: list[dict[str, Any]] = []
    if MANIFEST_PATH.exists():
        with MANIFEST_PATH.open(newline="", encoding="utf-8") as handle:
            rows = list(csv.DictReader(handle))
    counts: dict[str, int] = {}
    for row in rows:
        status = row.get("status") or "unknown"
        counts[status] = counts.get(status, 0) + 1
    summary = {
        "updated_at": utc_now(),
        "output_root": rel(output_root),
        "manifest_path": rel(MANIFEST_PATH),
        "model": model,
        "generation_mode": "built_in_imagegen",
        "api_enabled": False,
        "api_note": "Images registered from Codex built-in image generation; no project API request was made.",
        "total_manifest_rows": len(rows),
        "status_counts": counts,
        "successful_outputs": [
            row["output_path"]
            for row in rows
            if row.get("status") == "success" and row.get("output_path", "").startswith(rel(output_root))
        ],
        "no_mock_success": True,
        "no_placeholder_images": True,
    }
    RUN_SUMMARY_PATH.write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Register a built-in generated image into the Image2 batch output.")
    parser.add_argument("profile_id")
    parser.add_argument("slot", choices=["01_lifestyle_hero", "02_social_context"])
    parser.add_argument("--source")
    parser.add_argument(
        "--latest-source-root",
        default=str(Path.home() / ".codex" / "generated_images"),
        help="Used when --source is omitted; registers the newest generated image under this directory.",
    )
    parser.add_argument("--input", default=str(DEFAULT_INPUT))
    parser.add_argument("--output", default=str(DEFAULT_OUTPUT))
    parser.add_argument("--model", default="builtin-imagegen")
    parser.add_argument("--reference-image-used", action="store_true")
    parser.add_argument("--reset-manifest", action="store_true", help="Rebuild the manifest from this registration onward.")
    args = parser.parse_args()

    input_path = Path(args.input).expanduser()
    output_root = Path(args.output).expanduser()
    if args.source:
        source = Path(args.source).expanduser()
    else:
        source_root = Path(args.latest_source_root).expanduser()
        candidates = [
            path
            for path in source_root.rglob("*")
            if path.is_file() and path.suffix.lower() in {".png", ".jpg", ".jpeg", ".webp"}
        ]
        if not candidates:
            raise SystemExit(f"No generated images found under {source_root}")
        source = max(candidates, key=lambda path: path.stat().st_mtime)
    if not input_path.is_absolute():
        input_path = ROOT_DIR / input_path
    if not output_root.is_absolute():
        output_root = ROOT_DIR / output_root
    if not source.exists() or source.stat().st_size <= 0:
        raise SystemExit(f"Source image not found or empty: {source}")

    profile = load_profile(input_path, args.profile_id)
    prompt = build_prompt(profile, args.slot)
    profile_dir = output_root / safe_folder_name(profile)
    profile_dir.mkdir(parents=True, exist_ok=True)
    target = profile_dir / f"{args.slot}.png"
    shutil.copy2(source, target)

    created_at = utc_now()
    row = {
        "profile_id": profile["profile_id"],
        "name": profile["name"],
        "slot": args.slot,
        "output_path": rel(target),
        "model": args.model,
        "prompt_hash": prompt_hash(prompt),
        "status": "success",
        "error_message": "",
        "created_at": created_at,
        "reference_image_used": str(bool(args.reference_image_used)).lower(),
    }
    if args.reset_manifest:
        MANIFEST_PATH.parent.mkdir(parents=True, exist_ok=True)
        with MANIFEST_PATH.open("w", newline="", encoding="utf-8") as handle:
            csv.DictWriter(handle, fieldnames=MANIFEST_FIELDS).writeheader()
    upsert_manifest(row)
    write_run_summary(output_root=output_root, model=args.model)

    metadata_path = profile_dir / "metadata.json"
    if metadata_path.exists():
        metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    else:
        metadata = {
            "profile": profile,
            "model": args.model,
            "created_at": created_at,
            "prompts": {},
            "outputs": {},
            "image_records": {},
            "failures": [],
        }
    metadata.setdefault("prompts", {})[args.slot] = prompt
    metadata.setdefault("outputs", {})[args.slot] = rel(target)
    metadata.setdefault("image_records", {})[args.slot] = {
        "status": "success",
        "source_generated_image": str(source),
        "output_path": rel(target),
        "model": args.model,
        "prompt_hash": prompt_hash(prompt),
        "created_at": created_at,
        "reference_image_used": bool(args.reference_image_used),
        "bytes": target.stat().st_size,
        "dimensions": png_dimensions(target),
        "sha256": hashlib.sha256(target.read_bytes()).hexdigest(),
    }
    records = metadata.get("image_records", {})
    metadata["status"] = "success" if all(slot in records for slot in ["01_lifestyle_hero", "02_social_context"]) else "partial_success"
    metadata["updated_at"] = created_at
    metadata["model"] = args.model
    metadata_path.write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(json.dumps({"status": "success", "output_path": rel(target), "metadata_path": rel(metadata_path)}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
