import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, test } from "bun:test";

import {
  buildDouyinMiniExtJson,
  checkDouyinMiniExtConfig,
  runDouyinMiniExtConfigCli,
  writeDouyinMiniExtConfig,
} from "./douyin-mini-ext-config";

const EXT_APPID = "ttd033a68e4e56ccd301";
const DEPLOYMENT_KEY = "tenant-bJ4JdQryRi5H2zqrGYaI7kpqqnZHlZyh";
const EXPECTED_JSON = `${JSON.stringify({
  extEnable: true,
  extAppid: EXT_APPID,
  ext: {
    deployment_key: DEPLOYMENT_KEY,
    deployment_environment: "development",
  },
}, null, 2)}\n`;

const temporaryRoots = new Set<string>();

afterEach(() => {
  for (const root of temporaryRoots) {
    rmSync(root, { recursive: true, force: true });
  }
  temporaryRoots.clear();
});

describe("douyin miniapp ext config operations", () => {
  test("root package exposes ext write/check scripts and generated files are ignored", async () => {
    const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
    const packageJson = await Bun.file(join(repoRoot, "package.json")).json();
    const gitignore = await Bun.file(join(repoRoot, ".gitignore")).text();

    expect(packageJson.scripts["douyin-mini:write-ext"]).toBe(
      "bun scripts/ops/douyin-mini-ext-config.ts write",
    );
    expect(packageJson.scripts["douyin-mini:check-ext"]).toBe(
      "bun scripts/ops/douyin-mini-ext-config.ts check",
    );
    expect(gitignore).toContain("apps/douyin-mini/ext.json");
    expect(gitignore).toContain("apps/douyin-mini/src/ext.json");
    expect(gitignore).toContain("apps/douyin-mini/project.private.config.json");
  });

  test("builds the exact official ext.json shape without secret fields", () => {
    const extJson = buildDouyinMiniExtJson({
      extAppid: ` ${EXT_APPID} `,
      deploymentKey: ` ${DEPLOYMENT_KEY} `,
    });

    expect(extJson).toEqual({
      extEnable: true,
      extAppid: EXT_APPID,
      ext: {
        deployment_key: DEPLOYMENT_KEY,
        deployment_environment: "development",
      },
    });
    expect(JSON.stringify(extJson)).not.toMatch(/secret|token|openid|phone/i);
  });

  test("writes identical root and miniprogramRoot ext files", () => {
    const root = createTempRepo();

    const result = writeDouyinMiniExtConfig({
      repoRoot: root,
      extAppid: EXT_APPID,
      deploymentKey: DEPLOYMENT_KEY,
    });

    expect(result).toEqual({
      wrote: [
        "apps/douyin-mini/ext.json",
        "apps/douyin-mini/src/ext.json",
      ],
      extAppidTail: "d301",
      deploymentKeyTail: "lZyh",
    });
    expect(readFileSync(join(root, "apps/douyin-mini/ext.json"), "utf8"))
      .toBe(EXPECTED_JSON);
    expect(readFileSync(join(root, "apps/douyin-mini/src/ext.json"), "utf8"))
      .toBe(EXPECTED_JSON);
  });

  test("checks both ext files and rejects missing or mismatched generated config", () => {
    const root = createTempRepo();
    expect(checkDouyinMiniExtConfig({
      repoRoot: root,
      extAppid: EXT_APPID,
      deploymentKey: DEPLOYMENT_KEY,
    })).toEqual({
      ok: false,
      reason: "missing",
      path: "apps/douyin-mini/ext.json",
    });

    writeDouyinMiniExtConfig({
      repoRoot: root,
      extAppid: EXT_APPID,
      deploymentKey: DEPLOYMENT_KEY,
    });
    expect(checkDouyinMiniExtConfig({
      repoRoot: root,
      extAppid: EXT_APPID,
      deploymentKey: DEPLOYMENT_KEY,
    })).toEqual({ ok: true });

    const wrong = buildDouyinMiniExtJson({
      extAppid: "tt-wrong-authorizer",
      deploymentKey: DEPLOYMENT_KEY,
    });
    Bun.write(
      join(root, "apps/douyin-mini/src/ext.json"),
      `${JSON.stringify(wrong, null, 2)}\n`,
    );
    expect(checkDouyinMiniExtConfig({
      repoRoot: root,
      extAppid: EXT_APPID,
      deploymentKey: DEPLOYMENT_KEY,
    })).toEqual({
      ok: false,
      reason: "mismatch",
      path: "apps/douyin-mini/src/ext.json",
    });
  });

  test("CLI writes redacted metadata and validates environment boundaries", () => {
    const root = createTempRepo();
    const output: string[] = [];
    const errors: string[] = [];

    const code = runDouyinMiniExtConfigCli({
      argv: ["write", "--repo-root", root],
      env: {
        DOUYIN_MINIAPP_EXT_APPID: EXT_APPID,
        DOUYIN_MINIAPP_DEPLOYMENT_KEY: DEPLOYMENT_KEY,
      },
      writeStdout: (value) => output.push(value),
      writeStderr: (value) => errors.push(value),
    });

    expect(code).toBe(0);
    expect(errors).toEqual([]);
    expect(output.join("")).toBe(
      "{\"ok\":true,\"wrote\":[\"apps/douyin-mini/ext.json\",\"apps/douyin-mini/src/ext.json\"],\"extAppidTail\":\"d301\",\"deploymentKeyTail\":\"lZyh\"}\n",
    );
    expect(output.join("")).not.toContain(EXT_APPID);
    expect(output.join("")).not.toContain(DEPLOYMENT_KEY);

    expect(runDouyinMiniExtConfigCli({
      argv: ["check", "--repo-root", root],
      env: {
        DOUYIN_MINIAPP_EXT_APPID: EXT_APPID,
        DOUYIN_MINIAPP_DEPLOYMENT_KEY: DEPLOYMENT_KEY,
      },
      writeStdout: (value) => output.push(value),
      writeStderr: (value) => errors.push(value),
    })).toBe(0);
  });
});

function createTempRepo(): string {
  const root = mkdtempSync(join(tmpdir(), "gooes-douyin-mini-ext-"));
  temporaryRoots.add(root);
  return root;
}
