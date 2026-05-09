#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$ROOT_DIR"

rg -n \
  'from\("(customers|projects|employees|project_logs|expense_requests|project_acceptances|project_acceptance_items|project_acceptance_actions|project_acceptance_open_tickets|project_cameras|social_video_transcriptions|social_video_scripts|ai_call_logs)"\)|from\('\''(customers|projects|employees|project_logs|expense_requests|project_acceptances|project_acceptance_items|project_acceptance_actions|project_acceptance_open_tickets|project_cameras|social_video_transcriptions|social_video_scripts|ai_call_logs)'\''\)' \
  apps/api/src \
  -g '!node_modules'
