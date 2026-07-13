import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const repositoryRoot = join(webRoot, "../..");
const sourceRoots = [
  "apps/web/app",
  "apps/web/components",
  "apps/web/lib",
  "apps/web/public",
  "packages/domain/src",
];
const sourceFiles = [
  "apps/web/components.json",
  "apps/web/next.config.ts",
  "apps/web/package.json",
  "apps/web/postcss.config.mjs",
  "apps/web/scripts/check-lighthouse-summary.mjs",
  "apps/web/scripts/check-visible-copy.mjs",
  "apps/web/scripts/release-quality-digest.mjs",
  "apps/web/scripts/run-lighthouse-gate.mjs",
  "apps/web/scripts/run-playwright-e2e.mjs",
  "apps/web/scripts/sync-standalone-assets.mjs",
  "apps/web/scripts/verify-standalone-css.mjs",
  "apps/web/tailwind.config.ts",
  "apps/web/tsconfig.json",
  "bun.lock",
  "pnpm-lock.yaml",
];
const fixtureFiles = ["apps/web/e2e/upstream-stub.mjs"];

function collectFiles(path) {
  if (!existsSync(path)) return [];
  if (statSync(path).isFile()) return [path];
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) =>
    collectFiles(join(path, entry.name)));
}

function digestFiles(paths) {
  const hash = createHash("sha256");
  for (const path of paths.sort()) {
    const repositoryPath = relative(repositoryRoot, path).replaceAll("\\", "/");
    hash.update(repositoryPath);
    hash.update("\0");
    hash.update(readFileSync(path));
    hash.update("\0");
  }
  return hash.digest("hex");
}

export function computeReleaseQualityDigests() {
  const runtimePaths = [
    ...sourceRoots.flatMap((path) => collectFiles(join(repositoryRoot, path))),
    ...sourceFiles.map((path) => join(repositoryRoot, path)),
  ];
  const fixturePaths = fixtureFiles.map((path) => join(repositoryRoot, path));
  return {
    sourceDigest: digestFiles(runtimePaths),
    fixtureDigest: digestFiles(fixturePaths),
  };
}

export { repositoryRoot, webRoot };
