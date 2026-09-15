#!/usr/bin/env python3
"""Remove old, unused Gooes CCR digest references after a successful deploy."""

import argparse
import datetime as dt
import json
import re
import subprocess
import sys

IMAGE_NAMES = (
    "goose-api",
    "goose-admin",
    "goose-h5",
    "goose-web",
    "goose-social-video-worker",
)


def docker_json(*args: str) -> list[dict]:
    output = subprocess.check_output(["docker", *args], text=True)
    return json.loads(output)


def created_at(value: str) -> dt.datetime:
    # Docker writes nanoseconds; Python's ISO parser accepts microseconds.
    normalized = re.sub(r"\.(\d{6})\d+", r".\1", value.replace("Z", "+00:00"))
    return dt.datetime.fromisoformat(normalized)


def removable_tags(
    images: list[dict],
    used_image_ids: set[str],
    cutoff: dt.datetime,
    repository_prefix: str,
) -> list[str]:
    names = "|".join(re.escape(name) for name in IMAGE_NAMES)
    digest_tag = re.compile(
        rf"^{re.escape(repository_prefix)}(?:{names})@sha256:[a-f0-9]{{64}}$"
    )
    selected: list[str] = []
    for image in images:
        tags = image.get("RepoTags") or []
        if (
            image["Id"] not in used_image_ids
            and tags
            and all(digest_tag.fullmatch(tag) for tag in tags)
            and created_at(image["Created"]) < cutoff
        ):
            selected.extend(tags)
    return selected


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repository-prefix", required=True)
    parser.add_argument("--retention-hours", type=int, default=24)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    if not args.repository_prefix.endswith("/") or args.retention_hours < 24:
        parser.error("repository prefix must end with / and retention must be at least 24 hours")

    try:
        image_ids = list(dict.fromkeys(
            subprocess.check_output(["docker", "image", "ls", "-q", "--no-trunc"], text=True).split()
        ))
        container_ids = subprocess.check_output(["docker", "ps", "-aq"], text=True).split()
        images = docker_json("image", "inspect", *image_ids) if image_ids else []
        containers = docker_json("container", "inspect", *container_ids) if container_ids else []
    except (subprocess.CalledProcessError, json.JSONDecodeError) as error:
        print(f"cannot verify Docker image references: {error}", file=sys.stderr)
        return 1

    cutoff = dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=args.retention_hours)
    tags = removable_tags(images, {row["Image"] for row in containers}, cutoff,
                           args.repository_prefix)
    if args.dry_run:
        print(f"eligible_digest_references={len(tags)}; dry_run=true")
        return 0

    removed = 0
    failed = 0
    for tag in tags:
        result = subprocess.run(["docker", "image", "rm", tag], capture_output=True, text=True)
        if result.returncode == 0:
            removed += 1
        else:
            failed += 1
            print(f"failed to remove {tag}: {result.stderr.strip()[-180:]}", file=sys.stderr)
    print(f"eligible_digest_references={len(tags)} removed={removed} failed={failed}")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
