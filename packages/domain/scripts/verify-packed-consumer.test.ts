import { afterAll, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptsRoot = dirname(fileURLToPath(import.meta.url));
const packageRoot = dirname(scriptsRoot);
const verifierPath = join(scriptsRoot, "verify-packed-consumer.mjs");
const fixtureRoot = await mkdtemp(join(tmpdir(), "gooes-domain-verifier-test-"));
const packageManifest = JSON.parse(
  await readFile(join(packageRoot, "package.json"), "utf8"),
) as { version: string };
const expectedArchiveName = `gooes-domain-${packageManifest.version}.tgz`;

afterAll(async () => {
  await rm(fixtureRoot, { force: true, recursive: true });
});

async function runVerifier(
  archivePath: string,
  path = "/usr/bin:/bin",
) {
  const processResult = Bun.spawn([process.execPath, verifierPath], {
    cwd: packageRoot,
    env: {
      ...process.env,
      GOOES_DOMAIN_ARCHIVE: archivePath,
      // The explicit-archive branch must validate before trying to build or pack.
      PATH: path,
    },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(processResult.stdout).text(),
    new Response(processResult.stderr).text(),
    processResult.exited,
  ]);
  return { exitCode, stderr, stdout };
}

describe("packed domain consumer verifier", () => {
  test("rejects a missing explicit archive resolved from the verifier cwd", async () => {
    const archivePath = `./.missing-verifier-test/${expectedArchiveName}`;
    const result = await runVerifier(archivePath);

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("指定的 domain package archive 不存在");
    expect(result.stderr).toContain(resolve(packageRoot, archivePath));
  });

  test("rejects an explicit archive whose basename does not match package version", async () => {
    const archivePath = join(fixtureRoot, "gooes-domain-wrong-version.tgz");
    await writeFile(archivePath, "not-a-package");

    const result = await runVerifier(archivePath);

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain(
      `指定的 domain package archive 文件名必须为 ${expectedArchiveName}`,
    );
  });

  test("passes the exact explicit archive into the consumer install", async () => {
    const archiveRoot = join(fixtureRoot, "invalid-archive");
    const archivePath = join(archiveRoot, expectedArchiveName);
    await mkdir(archiveRoot);
    await writeFile(archivePath, "not-a-package");

    const result = await runVerifier(
      archivePath,
      process.env.PATH ?? "/usr/bin:/bin",
    );
    const output = `${result.stdout}\n${result.stderr}`;

    expect(result.exitCode).not.toBe(0);
    expect(output).toContain(archivePath);
    expect(output).not.toContain(
      "packed domain consumer verified with shared zod identity",
    );
  });

  test("generated type and runtime consumers assert procurement purpose presets", async () => {
    const source = await readFile(verifierPath, "utf8");

    expect(source).toContain("SUPPLIER_PURCHASE_PURPOSE_PRESETS");
    expect(source).toContain(
      'const projectPurposes: readonly ["项目备料", "现场补料"]',
    );
    expect(source).toContain(
      "assert.deepEqual(SUPPLIER_PURCHASE_PURPOSE_PRESETS, expectedPurchasePurposes);",
    );
    expect(source).toContain(
      "Object.values(SUPPLIER_PURCHASE_PURPOSE_PRESETS).flat().includes('其他')",
    );
  });
});
