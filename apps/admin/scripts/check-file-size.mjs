import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const MAX_LINES = 500;
const ROOT = process.cwd();
const EXCLUDED_DIRS = new Set([".next", "dist", "node_modules"]);
const TARGET_EXTENSIONS = new Set([".ts", ".tsx"]);

async function collectFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!EXCLUDED_DIRS.has(entry.name)) {
        files.push(...await collectFiles(path.join(dir, entry.name)));
      }
      continue;
    }

    if (entry.isFile() && TARGET_EXTENSIONS.has(path.extname(entry.name))) {
      files.push(path.join(dir, entry.name));
    }
  }

  return files;
}

function countLines(content) {
  if (content.length === 0) return 0;
  const newlineCount = content.match(/\n/g)?.length ?? 0;
  return content.endsWith("\n") ? newlineCount : newlineCount + 1;
}

const files = await collectFiles(ROOT);
const oversized = [];

for (const file of files) {
  const content = await readFile(file, "utf8");
  const lineCount = countLines(content);
  if (lineCount > MAX_LINES) {
    oversized.push({
      file: path.relative(ROOT, file),
      lineCount,
    });
  }
}

oversized.sort((a, b) => b.lineCount - a.lineCount || a.file.localeCompare(b.file));

if (oversized.length > 0) {
  for (const item of oversized) {
    console.error(`${item.lineCount} ${item.file}`);
  }
  process.exit(1);
}

console.log(`admin file size check passed: ${files.length} TS/TSX files <= ${MAX_LINES} lines`);
