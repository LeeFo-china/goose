#!/usr/bin/env bash
set -euo pipefail

JS_RUNTIME_BIN="${JS_RUNTIME_BIN:-}"
if [ -z "$JS_RUNTIME_BIN" ]; then
  if command -v node >/dev/null 2>&1; then
    JS_RUNTIME_BIN="node"
  else
    JS_RUNTIME_BIN="bun"
  fi
fi

JS_RUNTIME_SCRIPT="$(mktemp /tmp/gooes-system-metrics.XXXXXX.js)"
trap 'rm -f "$JS_RUNTIME_SCRIPT"' EXIT

cat > "$JS_RUNTIME_SCRIPT" <<'NODE'
const fs = require("node:fs");
const os = require("node:os");
const { execFileSync } = require("node:child_process");

function round(value, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function readProcStat() {
  try {
    const line = fs.readFileSync("/proc/stat", "utf8").split("\n")[0] || "";
    const parts = line.trim().split(/\s+/).slice(1).map((value) => Number(value));
    if (parts.length < 4 || parts.some((value) => !Number.isFinite(value))) {
      return null;
    }

    const idle = (parts[3] || 0) + (parts[4] || 0);
    const total = parts.reduce((sum, value) => sum + value, 0);
    return { idle, total };
  } catch {
    return null;
  }
}

function readCpuTimes() {
  const cpus = os.cpus();
  const totals = cpus.reduce((sum, cpu) => {
    const times = cpu.times;
    return {
      idle: sum.idle + times.idle,
      total: sum.total + Object.values(times).reduce((timeSum, value) => timeSum + value, 0),
    };
  }, { idle: 0, total: 0 });
  return totals.total ? totals : null;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getCpuUsagePercent() {
  const first = readProcStat() || readCpuTimes();
  await sleep(250);
  const second = readProcStat() || readCpuTimes();
  if (!first || !second) return 0;

  const idleDelta = second.idle - first.idle;
  const totalDelta = second.total - first.total;
  if (totalDelta <= 0) return 0;

  return round(Math.max(0, Math.min(100, (1 - idleDelta / totalDelta) * 100)));
}

function getMemory() {
  const totalMb = os.totalmem() / 1024 / 1024;
  const freeMb = os.freemem() / 1024 / 1024;
  const usedMb = Math.max(0, totalMb - freeMb);
  return {
    total_mb: round(totalMb),
    used_mb: round(usedMb),
    free_mb: round(freeMb),
    usage_percent: totalMb > 0 ? round((usedMb / totalMb) * 100) : 0,
  };
}

function getDisk() {
  try {
    const output = execFileSync("df", ["-P", process.cwd()], { encoding: "utf8" });
    const line = output.trim().split("\n")[1] || "";
    const parts = line.trim().split(/\s+/);
    const totalKb = Number(parts[1] || 0);
    const usedKb = Number(parts[2] || 0);
    const availableKb = Number(parts[3] || 0);
    return {
      total_mb: round(totalKb / 1024),
      used_mb: round(usedKb / 1024),
      available_mb: round(availableKb / 1024),
      usage_percent: totalKb > 0 ? round((usedKb / totalKb) * 100) : 0,
    };
  } catch {
    return {
      total_mb: 0,
      used_mb: 0,
      available_mb: 0,
      usage_percent: 0,
    };
  }
}

(async () => {
  const cpuUsagePercent = await getCpuUsagePercent();
  const payload = {
    server: {
      cpu_usage_percent: cpuUsagePercent,
      memory: getMemory(),
      disk: getDisk(),
      load_average: os.loadavg().map((value) => round(value, 2)),
    },
    checked_at: new Date().toISOString(),
  };

  process.stdout.write(`${JSON.stringify(payload)}\n`);
})().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
NODE

"$JS_RUNTIME_BIN" "$JS_RUNTIME_SCRIPT"
