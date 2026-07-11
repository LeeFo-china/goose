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
    const tags = [
      `gooes-web:rollback-101-${now - 6 * 86_400} sha6`,
      `gooes-web:rollback-102-${now - 7 * 86_400} sha7`,
      `gooes-web:rollback-103-${now - 8 * 86_400} sha8`,
      `gooes-web:rollback-104-${now - 8 * 86_400} current-image`,
      "gooes-web:rollback-legacy shalegacy",
    ].join("\n");
    const docker = join(root, "docker");
    writeFileSync(
      docker,
      `#!/usr/bin/env bash
set -euo pipefail
case "$1" in
  images) printf '%s\\n' "${tags}" ;;
  inspect) printf '%s\\n' current-image ;;
  rmi) printf '%s\\n' "$2" >> "${removed}" ;;
  *) exit 2 ;;
esac
`,
    );
    chmodSync(docker, 0o755);

    const result = spawnSync("bash", [script], {
      encoding: "utf8",
      env: { ...process.env, PATH: `${root}:${process.env.PATH}`, ROLLBACK_NOW: String(now) },
    });

    expect(result.status).toBe(0);
    if (!existsSync(removed)) throw new Error(`cleanup did not remove a tag: ${result.stderr}`);
    expect(readFileSync(removed, "utf8").trim()).toBe(
      `gooes-web:rollback-103-${now - 8 * 86_400}`,
    );
    expect(result.stderr).toContain("skip unparseable rollback tag: gooes-web:rollback-legacy");
    expect(result.stderr).toContain("skip rollback tag used by gooes-web");
  });
});
