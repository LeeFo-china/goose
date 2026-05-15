#!/usr/bin/env bash
set -euo pipefail

PM2_BIN="${PM2_BIN:-pm2}"
JS_RUNTIME_BIN="${JS_RUNTIME_BIN:-}"
if [ -z "$JS_RUNTIME_BIN" ]; then
  if command -v node >/dev/null 2>&1; then
    JS_RUNTIME_BIN="node"
  else
    JS_RUNTIME_BIN="bun"
  fi
fi

PM2_JSON="$("$PM2_BIN" jlist 2>/dev/null || echo "[]")"
JS_RUNTIME_SCRIPT="$(mktemp /tmp/gooes-pm2-status.XXXXXX.js)"
trap 'rm -f "$JS_RUNTIME_SCRIPT"' EXIT

cat > "$JS_RUNTIME_SCRIPT" <<'NODE'
try {
  const apps = JSON.parse(process.env.PM2_JSON || "[]");
  const targetNames = new Set(["goose", "goose-admin", "goose-social-video-worker"]);
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

PM2_JSON="$PM2_JSON" "$JS_RUNTIME_BIN" "$JS_RUNTIME_SCRIPT"
