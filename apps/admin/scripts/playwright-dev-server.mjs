import { spawn } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const filesToRestore = ["next-env.d.ts", "tsconfig.json"];
const snapshots = new Map();

for (const file of filesToRestore) {
  const path = join(process.cwd(), file);
  if (existsSync(path)) {
    snapshots.set(path, readFileSync(path, "utf8"));
  }
}

function restoreSnapshots() {
  for (const [path, content] of snapshots) {
    writeFileSync(path, content);
  }
}

const restoreTimer = setInterval(restoreSnapshots, 1_000);

rmSync(join(process.cwd(), ".next-e2e"), { recursive: true, force: true });

const child = spawn(
  "pnpm",
  ["exec", "next", "dev", "-H", "127.0.0.1", "-p", "3011"],
  {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NEXT_DIST_DIR: ".next-e2e",
    },
    stdio: "inherit",
  },
);

let shuttingDown = false;

function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  clearInterval(restoreTimer);
  child.kill(signal);
  restoreSnapshots();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("exit", restoreSnapshots);

child.on("exit", (code, signal) => {
  clearInterval(restoreTimer);
  restoreSnapshots();
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
