import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

const args = new Set(process.argv.slice(2));
const stagedOnly = args.has("--staged");

const API_SOURCE_RE = /^apps\/api\/src\/.*\.(ts|tsx|js|jsx|mjs|cjs)$/;
const ADMIN_SOURCE_RE = /^apps\/admin\/.*\.(ts|tsx)$/;
const ADMIN_EXCLUDED_RE = /^apps\/admin\/(\.next|dist|node_modules)\//;

const changedFiles = stagedOnly ? getStagedFiles() : [];
const shouldCheckApi =
  !stagedOnly || changedFiles.some((filePath) => API_SOURCE_RE.test(filePath));
const shouldCheckAdmin =
  !stagedOnly ||
  changedFiles.some(
    (filePath) => ADMIN_SOURCE_RE.test(filePath) && !ADMIN_EXCLUDED_RE.test(filePath),
  );

if (!shouldCheckApi && !shouldCheckAdmin) {
  console.log("file size check skipped: no staged API/Admin source files.");
  process.exit(0);
}

if (shouldCheckApi) {
  run("bun", ["scripts/check-api-file-size.ts"]);
}

if (shouldCheckAdmin) {
  run("pnpm", ["--dir", "apps/admin", "run", "check:file-size"]);
}

function getStagedFiles() {
  const output = execFileSync(
    "git",
    ["diff", "--cached", "--name-only", "--diff-filter=ACMR"],
    { encoding: "utf8" },
  );
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((filePath) => existsSync(filePath));
}

function run(command: string, commandArgs: string[]) {
  execFileSync(command, commandArgs, { stdio: "inherit" });
}
