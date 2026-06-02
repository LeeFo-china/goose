import { readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";

const THRESHOLD = 500;
const API_ROOT = "apps/api";
const EXCLUDED_DIRS = new Set(["node_modules", "dist", "build", "coverage"]);
const INCLUDED_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);

const GENERATED_FILE_EXCLUSIONS = new Map<string, string>([
  ["apps/api/src/types/database.ts", "generated Supabase database types"],
]);

const EXEMPTIONS = new Map<string, string>([]);

function getRepoRoot() {
  const cwd = process.cwd();
  if (existsSync(join(cwd, API_ROOT))) {
    return cwd;
  }

  return resolve(cwd, "../..");
}

function toPosixPath(path: string) {
  return path.split(sep).join("/");
}

function getExtension(path: string) {
  const match = path.match(/\.[^.]+$/);
  return match?.[0] || "";
}

async function collectFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.has(entry.name)) {
        continue;
      }
      files.push(...await collectFiles(join(dir, entry.name)));
      continue;
    }

    if (entry.isFile() && INCLUDED_EXTENSIONS.has(getExtension(entry.name))) {
      files.push(join(dir, entry.name));
    }
  }

  return files;
}

function countLines(content: string) {
  if (!content) {
    return 0;
  }

  const newlineCount = content.match(/\n/g)?.length || 0;
  return content.endsWith("\n") ? newlineCount : newlineCount + 1;
}

const repoRoot = getRepoRoot();
const apiRoot = join(repoRoot, API_ROOT);
const files = await collectFiles(apiRoot);
const violations: Array<{ lines: number; path: string }> = [];
const oversizedExemptions: Array<{ lines: number; path: string; reason: string }> = [];
const generatedExclusions: Array<{ lines: number; path: string; reason: string }> = [];

for (const file of files) {
  const relativePath = toPosixPath(relative(repoRoot, file));
  const lines = countLines(await readFile(file, "utf8"));

  if (lines < THRESHOLD) {
    continue;
  }

  const generatedExclusion = GENERATED_FILE_EXCLUSIONS.get(relativePath);
  if (generatedExclusion) {
    generatedExclusions.push({ lines, path: relativePath, reason: generatedExclusion });
    continue;
  }

  const exemption = EXEMPTIONS.get(relativePath);
  if (exemption) {
    oversizedExemptions.push({ lines, path: relativePath, reason: exemption });
    continue;
  }

  violations.push({ lines, path: relativePath });
}

violations.sort((left, right) => right.lines - left.lines);
oversizedExemptions.sort((left, right) => right.lines - left.lines);
generatedExclusions.sort((left, right) => right.lines - left.lines);

if (generatedExclusions.length > 0) {
  console.log("Generated oversized API files excluded from exemption count:");
  for (const item of generatedExclusions) {
    console.log(`${item.lines} ${item.path} - ${item.reason}`);
  }
}

if (oversizedExemptions.length > 0) {
  console.log("Exempt oversized API files:");
  for (const item of oversizedExemptions) {
    console.log(`${item.lines} ${item.path} - ${item.reason}`);
  }
}

if (violations.length > 0) {
  console.error("Non-exempt oversized API files:");
  for (const item of violations) {
    console.error(`${item.lines} ${item.path}`);
  }
  process.exit(1);
}

console.log(`API file size check passed. threshold=${THRESHOLD}, exemptions=${oversizedExemptions.length}`);
