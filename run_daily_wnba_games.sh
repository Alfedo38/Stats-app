#!/usr/bin/env bash
set -euo pipefail

ROOT="/home/alfedo/stats-app"
PYTHON="$ROOT/motor_python/.venv/bin/python3"
SCRIPT="$ROOT/motor_python/WNBA/sync_wnba_daily_games.py"
LOG_DIR="$ROOT/logs"

mkdir -p "$LOG_DIR"

cd "$ROOT"

echo "==========================================================="
echo "WNBA DAILY GAMES SYNC - $(date '+%Y-%m-%d %H:%M:%S')"
echo "==========================================================="

"$PYTHON" "$SCRIPT" \
  --schema wnba_api_data \
  --days-around 2

echo "✅ WNBA daily games sync terminado"
