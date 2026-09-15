import datetime as dt
import importlib.util
import pathlib
import sys
import unittest

sys.dont_write_bytecode = True
SCRIPT = pathlib.Path(__file__).with_name("cleanup-production-digest-images.py")
SPEC = importlib.util.spec_from_file_location("cleanup_production_digest_images", SCRIPT)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)

PREFIX = "useccr.ccs.tencentyun.com/america_goose/"
NOW = dt.datetime(2026, 9, 15, 7, 0, tzinfo=dt.timezone.utc)
OLD = "2026-09-13T07:00:00.123456789Z"
RECENT = "2026-09-15T06:00:00.123456789Z"


def image(identifier: str, created: str, tags: list[str]) -> dict:
    return {"Id": identifier, "Created": created, "RepoTags": tags}


class DigestCleanupSelectionTests(unittest.TestCase):
    def test_preserves_current_recent_rollback_and_foreign_images(self) -> None:
        digest = "a" * 64
        tag = f"{PREFIX}goose-api@sha256:{digest}"
        rows = [
            image("old", OLD, [tag]),
            image("active", OLD, [tag]),
            image("recent", RECENT, [tag]),
            image("rollback", OLD, [tag, "gooes-api:rollback-20260915"]),
            image("foreign", OLD, [f"supabase/postgres@sha256:{digest}"]),
        ]
        cutoff = NOW - dt.timedelta(hours=24)
        self.assertEqual(MODULE.removable_tags(rows, {"active"}, cutoff, PREFIX), [tag])

    def test_keeps_any_image_with_a_non_digest_tag(self) -> None:
        tag = f"{PREFIX}goose-admin@sha256:{'b' * 64}"
        rows = [image("candidate", OLD, [tag, f"{PREFIX}goose-admin:main"])]
        self.assertEqual(MODULE.removable_tags(rows, set(), NOW, PREFIX), [])


if __name__ == "__main__":
    unittest.main()
