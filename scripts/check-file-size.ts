import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

const args = new Set(process.argv.slice(2));
const stagedOnly = args.has("--staged");

const API_SOURCE_RE = /^apps\/api\/src\/.*\.(ts|tsx|js|jsx|mjs|cjs)$/;
const ADMIN_SOURCE_RE = /^apps\/admin\/.*\.(ts|tsx)$/;
const ADMIN_EXCLUDED_RE =
  /^apps\/admin\/(\.next|\.next-dev|\.next-e2e|dist|node_modules)\//;
const STAGED_SOURCE_PATHS = ["apps/api/src", "apps/admin"];
const GIT_DIFF_MAX_BUFFER = 32 * 1024 * 1024;

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
    [
      "-c",
      "core.quotepath=false",
      "diff",
      "--cached",
      "--name-only",
      "-z",
      "--diff-filter=ACMR",
      "--",
      ...STAGED_SOURCE_PATHS,
    ],
    { encoding: "utf8", maxBuffer: GIT_DIFF_MAX_BUFFER },
  );
  return output
    .split("\0")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((filePath) => existsSync(filePath));
}

function run(command: string, commandArgs: string[]) {
  execFileSync(command, commandArgs, { stdio: "inherit" });
}
