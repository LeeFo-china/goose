import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";

const fixtures: string[] = [];
const sourceScript = new URL("../scripts/verify-standalone-css.mjs", import.meta.url);

function createFixture(): { root: string; script: string } {
  const root = mkdtempSync(join(tmpdir(), "gooes-web-verify-"));
  const script = join(root, "scripts", "verify-standalone-css.mjs");
  fixtures.push(root);
  mkdirSync(join(root, "scripts"), { recursive: true });
  cpSync(sourceScript, script);
  return { root, script };
}

function run(script: string): ReturnType<typeof Bun.spawnSync> {
  return Bun.spawnSync(["node", script], { stderr: "pipe", stdout: "pipe" });
}

afterEach(() => {
  for (const fixture of fixtures.splice(0)) rmSync(fixture, { force: true, recursive: true });
});

describe("standalone CSS verification", () => {
  test("fails clearly when standalone output is absent", () => {
    const result = run(createFixture().script);
    expect(result.exitCode).toBe(1);
    expect(result.stderr?.toString() ?? "").toContain("missing standalone directory");
  });

  test("fails when CSS or public assets are empty", () => {
    const { root, script } = createFixture();
    const staticDir = join(root, ".next", "standalone", "apps", "web", ".next", "static");
    const publicDir = join(root, ".next", "standalone", "apps", "web", "public");
    mkdirSync(staticDir, { recursive: true });
    mkdirSync(publicDir, { recursive: true });
    writeFileSync(join(staticDir, "empty.css"), "");
    writeFileSync(join(publicDir, "empty.png"), "");
    const result = run(script);
    expect(result.exitCode).toBe(1);
    expect(result.stderr?.toString() ?? "").toContain("no non-empty CSS file");
    expect(result.stderr?.toString() ?? "").toContain("no non-empty static asset");
    expect(result.stderr?.toString() ?? "").toContain("no non-empty public asset");
  });

  test("accepts non-empty copied CSS and public assets", () => {
    const { root, script } = createFixture();
    const standalone = join(root, ".next", "standalone", "apps", "web");
    mkdirSync(join(standalone, ".next", "static", "css"), { recursive: true });
    mkdirSync(join(standalone, "public"), { recursive: true });
    writeFileSync(join(standalone, ".next", "static", "css", "app.css"), "body{}");
    writeFileSync(join(standalone, ".next", "static", "app.js"), "script");
    writeFileSync(join(standalone, "public", "logo.png"), "asset");
    const result = run(script);
    expect(result.exitCode).toBe(0);
    expect(result.stdout?.toString() ?? "").toContain(
      "Verified 1 CSS file(s), 1 static asset(s), and 1 public asset(s)",
    );
  });
});
