import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";

const appRoot = new URL("../", import.meta.url);
const sourceScript = new URL(
  "scripts/sync-standalone-assets.mjs",
  appRoot,
);
const fixtures: string[] = [];

function createFixture(): { root: string; script: string } {
  const root = mkdtempSync(join(tmpdir(), "gooes-web-assets-"));
  const script = join(root, "scripts", "sync-standalone-assets.mjs");

  fixtures.push(root);
  mkdirSync(dirname(script), { recursive: true });
  cpSync(sourceScript, script);

  return { root, script };
}

function runScript(script: string): ReturnType<typeof Bun.spawnSync> {
  return Bun.spawnSync(["node", script], {
    stderr: "pipe",
    stdout: "pipe",
  });
}

afterEach(() => {
  for (const fixture of fixtures.splice(0)) {
    rmSync(fixture, { force: true, recursive: true });
  }
});

describe("standalone asset sync", () => {
  test("fails when the standalone server output is missing", () => {
    const { root, script } = createFixture();
    mkdirSync(join(root, ".next", "static"), { recursive: true });

    const result = runScript(script);

    expect(result.exitCode).toBe(1);
    expect(result.stderr?.toString() ?? "").toContain(
      "Missing required standalone output",
    );
  });

  test("fails when the static assets are missing", () => {
    const { root, script } = createFixture();
    mkdirSync(join(root, ".next", "standalone", "apps", "web"), {
      recursive: true,
    });

    const result = runScript(script);

    expect(result.exitCode).toBe(1);
    expect(result.stderr?.toString() ?? "").toContain(
      "Missing required static assets",
    );
  });

  test("copies static assets while keeping public optional", () => {
    const { root, script } = createFixture();
    const staticDir = join(root, ".next", "static");
    const copiedAsset = join(
      root,
      ".next",
      "standalone",
      "apps",
      "web",
      ".next",
      "static",
      "asset.txt",
    );

    mkdirSync(staticDir, { recursive: true });
    mkdirSync(join(root, ".next", "standalone", "apps", "web"), {
      recursive: true,
    });
    writeFileSync(join(staticDir, "asset.txt"), "static asset");

    const result = runScript(script);

    expect(result.exitCode).toBe(0);
    expect(existsSync(join(root, "public"))).toBe(false);
    expect(readFileSync(copiedAsset, "utf8")).toBe("static asset");
  });
});
