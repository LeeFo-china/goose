#!/usr/bin/env bash
set -euo pipefail

PM2_BIN="${PM2_BIN:-pm2}"
PM2_JSON="$("$PM2_BIN" jlist)"

PM2_JSON="$PM2_JSON" node <<'NODE'
try {
  const apps = JSON.parse(process.env.PM2_JSON || "[]");
  const targetNames = new Set(["goose", "goose-admin"]);
  const rows = apps
    .filter((app) => targetNames.has(app.name))
    .map((app) => ({
      name: app.name,
      status: app.pm2_env?.status || "unknown",
      pid: app.pid || "-",
      uptime: app.pm2_env?.pm_uptime
        ? `${Math.max(0, Math.round((Date.now() - app.pm2_env.pm_uptime) / 1000))}s`
        : "-",
      restarts: app.pm2_env?.restart_time ?? 0,
      cpu: `${app.monit?.cpu ?? 0}%`,
      memory: app.monit?.memory
        ? `${(app.monit.memory / 1024 / 1024).toFixed(1)}mb`
        : "-",
    }));

  if (!rows.length) {
    console.log("No goose PM2 processes found.");
    process.exit(0);
  }

  for (const row of rows) {
    console.log(`${row.name}: status=${row.status} pid=${row.pid} uptime=${row.uptime} restarts=${row.restarts} cpu=${row.cpu} memory=${row.memory}`);
  }
} catch (error) {
  console.error(`Failed to parse PM2 status: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
NODE
