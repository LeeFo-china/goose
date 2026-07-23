import { spawn } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const filesToRestore = ["next-env.d.ts", "tsconfig.json"];
const snapshots = new Map();
const port = process.env.PLAYWRIGHT_DEV_SERVER_PORT || "3011";
const nextDistDir = process.env.PLAYWRIGHT_NEXT_DIST_DIR || ".next-e2e";
const nextDistPath = join(process.cwd(), nextDistDir);
const nextCliPath = join(process.cwd(), "node_modules", "next", "dist", "bin", "next");

for (const file of filesToRestore) {
  const path = join(process.cwd(), file);
  if (existsSync(path)) {
    snapshots.set(path, readFileSync(path, "utf8"));
  }
}

function restoreSnapshots() {
  for (const [path, content] of snapshots) {
    if (!existsSync(path) || readFileSync(path, "utf8") !== content) {
      writeFileSync(path, content);
    }
  }
}

const restoreTimer = setInterval(restoreSnapshots, 1_000);

rmSync(nextDistPath, { recursive: true, force: true });

let cleanedUp = false;

function cleanup() {
  if (cleanedUp) return;
  cleanedUp = true;
  clearInterval(restoreTimer);
  restoreSnapshots();
  rmSync(nextDistPath, { recursive: true, force: true });
}

const child = spawn(
  process.execPath,
  [nextCliPath, "dev", "-H", "127.0.0.1", "-p", port],
  {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NEXT_DIST_DIR: nextDistDir,
    },
    stdio: "inherit",
  },
);

let shuttingDown = false;

function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  child.kill(signal);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("exit", cleanup);

child.on("exit", (code, signal) => {
  cleanup();
  process.exit(code ?? (signal ? 0 : 1));
});
