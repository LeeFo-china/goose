import { afterEach, describe, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const roots: string[] = [];
const script = resolve(import.meta.dir, "../../../scripts/cleanup-web-rollback-images.sh");

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("Web rollback image retention", () => {
  test("keeps six-day, seven-day and unparseable tags but deletes an eight-day tag", () => {
    const root = mkdtempSync(join(tmpdir(), "web-rollback-cleanup-"));
    roots.push(root);
    const removed = join(root, "removed.txt");
    const now = 2_000_000_000;
    const sha = "a".repeat(40);
    const tags = [
      `gooes-web:rollback-101-${now - 6 * 86_400} id-six`,
      `gooes-web:rollback-102-${now - 7 * 86_400} id-seven`,
      `gooes-web:rollback-103-${now - 8 * 86_400} id-old`,
      `gooes-web:rollback-104-${now - 8 * 86_400} id-referenced`,
      "gooes-web:rollback-legacy id-legacy",
    ].join("\n");
    const docker = join(root, "docker");
    writeFileSync(
      docker,
      `#!/usr/bin/env bash
set -euo pipefail
case "$1" in
  images) printf '%s\\n' "${tags}" ;;
  inspect) printf '%s\\n' current-image ;;
  ps)
    if [[ "$*" == *"ancestor=id-referenced"* ]]; then printf '%s\\n' stopped-container; fi
    ;;
  image)
    case "$*" in
      *id-old*) printf '%s\\n' \
        "gooes-web:rollback-103-${now - 8 * 86_400}" \
        "ccr.ccs.tencentyun.com/gooes-goodcms/goose-web:${sha}" \
        "ccr.ccs.tencentyun.com/gooes-goodcms/goose-web:main" \
        "ccr.ccs.tencentyun.com/gooes-goodcms/goose-web:dev" \
        "other.example.com/team/other:${sha}" ;;
      *) exit 2 ;;
    esac
    ;;
  rmi) shift; printf '%s\\n' "$@" >> "${removed}" ;;
  *) exit 2 ;;
esac
`,
    );
    chmodSync(docker, 0o755);

    const result = spawnSync("bash", [script], {
      encoding: "utf8",
      env: { ...process.env, PATH: `${root}:${process.env.PATH}`, ROLLBACK_NOW: String(now) },
    });

    if (result.status !== 0) throw new Error(`cleanup failed: ${result.stderr}`);
    if (!existsSync(removed)) throw new Error(`cleanup did not remove a tag: ${result.stderr}`);
    expect(readFileSync(removed, "utf8").trim().split("\n")).toEqual([
      `gooes-web:rollback-103-${now - 8 * 86_400}`,
      `ccr.ccs.tencentyun.com/gooes-goodcms/goose-web:${sha}`,
    ]);
    expect(result.stderr).toContain("skip unparseable rollback tag: gooes-web:rollback-legacy");
    expect(result.stderr).toContain("skip rollback image referenced by a container: id-referenced");
  });
});
