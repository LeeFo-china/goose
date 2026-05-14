#!/usr/bin/env python3
"""
Minimal panorama stitching prototype.

Usage:
  python3 stitch_panorama.py ./samples/room ./out/room --make-tiles --run-dzsave
"""

from __future__ import annotations

import argparse
import json
import math
import shutil
import subprocess
from pathlib import Path

import cv2


STATUS_LABELS = {
    0: "OK",
    1: "ERR_NEED_MORE_IMGS",
    2: "ERR_HOMOGRAPHY_EST_FAIL",
    3: "ERR_CAMERA_PARAMS_ADJUST_FAIL",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Stitch images into a panorama.")
    parser.add_argument("input_dir", help="Directory containing ordered source images.")
    parser.add_argument("output_dir", help="Directory for panorama, tiles, and manifest.")
    parser.add_argument("--pattern", default="*.jpg", help="Source glob pattern.")
    parser.add_argument("--max-input-side", type=int, default=1600, help="Resize sources before stitching; 0 disables.")
    parser.add_argument("--preview-width", type=int, default=2048)
    parser.add_argument("--tile-size", type=int, default=1024)
    parser.add_argument("--make-tiles", action="store_true", help="Generate PSV grid tiles.")
    parser.add_argument("--run-dzsave", action="store_true", help="Also run vips dzsave if installed.")
    return parser.parse_args()


def read_images(input_dir: Path, pattern: str) -> list[tuple[Path, cv2.typing.MatLike]]:
    paths = sorted(input_dir.glob(pattern))
    if len(paths) < 3:
        raise SystemExit("Need at least 3 ordered images for stitching.")

    images = []
    for path in paths:
        image = cv2.imread(str(path))
        if image is None:
            raise SystemExit(f"Failed to read image: {path}")
        images.append((path, image))
    return images


def resize_for_stitching(
    image: cv2.typing.MatLike,
    max_input_side: int,
) -> cv2.typing.MatLike:
    if max_input_side <= 0:
        return image

    height, width = image.shape[:2]
    longest = max(width, height)
    if longest <= max_input_side:
        return image

    scale = max_input_side / longest
    target_width = max(1, round(width * scale))
    target_height = max(1, round(height * scale))
    return cv2.resize(image, (target_width, target_height), interpolation=cv2.INTER_AREA)


def stitch(images: list[cv2.typing.MatLike]) -> cv2.typing.MatLike:
    if hasattr(cv2, "Stitcher_create"):
        stitcher = cv2.Stitcher_create(cv2.Stitcher_PANORAMA)
    else:
        stitcher = cv2.Stitcher.create(cv2.Stitcher_PANORAMA)
    status, pano = stitcher.stitch(images)
    if status != cv2.Stitcher_OK:
        label = STATUS_LABELS.get(status, f"UNKNOWN_{status}")
        raise SystemExit(f"OpenCV stitch failed: {label} ({status})")
    return pano


def save_preview(pano: cv2.typing.MatLike, output_path: Path, target_width: int) -> None:
    height, width = pano.shape[:2]
    if width <= target_width:
        preview = pano
    else:
        target_height = max(1, round(height * target_width / width))
        preview = cv2.resize(pano, (target_width, target_height), interpolation=cv2.INTER_AREA)
    cv2.imwrite(str(output_path), preview)


def save_psv_tiles(
    pano: cv2.typing.MatLike,
    tiles_dir: Path,
    tile_size: int,
) -> tuple[int, int]:
    height, width = pano.shape[:2]
    cols = max(1, math.ceil(width / tile_size))
    rows = max(1, math.ceil(height / tile_size))
    tile_width = math.ceil(width / cols)
    tile_height = math.ceil(height / rows)
    padded_width = tile_width * cols
    padded_height = tile_height * rows

    padded = cv2.copyMakeBorder(
        pano,
        0,
        padded_height - height,
        0,
        padded_width - width,
        cv2.BORDER_REPLICATE,
    )

    tiles_dir.mkdir(parents=True, exist_ok=True)
    for row in range(rows):
        for col in range(cols):
            tile = padded[
                row * tile_height : (row + 1) * tile_height,
                col * tile_width : (col + 1) * tile_width,
            ]
            cv2.imwrite(str(tiles_dir / f"{col}_{row}.jpg"), tile)

    return cols, rows


def run_dzsave(panorama_path: Path, output_dir: Path) -> str | None:
    if not shutil.which("vips"):
        return None

    dz_path = output_dir / "dz_tiles"
    subprocess.run(
        ["vips", "dzsave", str(panorama_path), str(dz_path)],
        check=True,
    )
    return dz_path.name


def main() -> None:
    args = parse_args()
    input_dir = Path(args.input_dir).resolve()
    output_dir = Path(args.output_dir).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    sources = read_images(input_dir, args.pattern)
    stitch_inputs = [
        resize_for_stitching(image, args.max_input_side)
        for _, image in sources
    ]
    pano = stitch(stitch_inputs)

    panorama_path = output_dir / "panorama.jpg"
    preview_path = output_dir / "preview.jpg"
    cv2.imwrite(str(panorama_path), pano)
    save_preview(pano, preview_path, args.preview_width)

    height, width = pano.shape[:2]
    cols = rows = None
    if args.make_tiles:
        cols, rows = save_psv_tiles(pano, output_dir / "tiles", args.tile_size)

    dz_path = run_dzsave(panorama_path, output_dir) if args.run_dzsave else None
    manifest = {
        "source_count": len(sources),
        "source_files": [path.name for path, _ in sources],
        "max_input_side": args.max_input_side,
        "width": width,
        "height": height,
        "projection": "equirectangular" if abs((width / height) - 2) < 0.15 else "partial_equirectangular",
        "panoramaUrl": "panorama.jpg",
        "previewUrl": "preview.jpg",
        "tiles": {
            "cols": cols,
            "rows": rows,
            "tileUrlTemplate": "tiles/{col}_{row}.jpg",
        } if cols and rows else None,
        "dzsavePath": dz_path,
    }
    (output_dir / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(json.dumps(manifest, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
