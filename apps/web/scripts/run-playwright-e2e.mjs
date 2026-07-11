import { createHash } from "node:crypto";
import { readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const webRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const trackedConfigFiles = ["next-env.d.ts", "tsconfig.json"];

function hashFile(fileName) {
  return createHash("sha256")
    .update(readFileSync(join(webRoot, fileName)))
    .digest("hex");
}

const before = new Map(trackedConfigFiles.map((fileName) => [fileName, hashFile(fileName)]));
rmSync(join(webRoot, ".next"), { recursive: true, force: true });

const environment = { ...process.env };
delete environment.NO_COLOR;
const result = spawnSync("pnpm", ["exec", "playwright", "test", ...process.argv.slice(2)], {
  cwd: webRoot,
  env: environment,
  stdio: "inherit",
});

const changedFiles = trackedConfigFiles.filter(
  (fileName) => before.get(fileName) !== hashFile(fileName),
);
if (changedFiles.length > 0) {
  console.error(`Playwright 修改了受跟踪的 Next 配置: ${changedFiles.join(", ")}`);
  process.exitCode = 1;
} else if (result.error) {
  console.error(`Playwright 启动失败: ${result.error.message}`);
  process.exitCode = 1;
} else {
  process.exitCode = result.status ?? 1;
}
