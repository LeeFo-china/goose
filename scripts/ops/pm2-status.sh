#!/usr/bin/env bash
set -euo pipefail

PM2_BIN="${PM2_BIN:-pm2}"

"$PM2_BIN" list --no-color

