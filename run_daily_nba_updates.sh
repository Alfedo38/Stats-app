#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="/home/alfedo/stats-app"
cd "$APP_DIR"

mkdir -p logs

LOCK_FILE="/tmp/ludo_daily_nba_updates.lock"
exec 9>"$LOCK_FILE"

if ! flock -n 9; then
  echo "Otro update NBA ya está corriendo. Salgo para no pisar procesos."
  exit 0
fi

D="${1:-$(date -d 'yesterday' +%F)}"
TS="$(date +%Y%m%d_%H%M%S)"
LOG_FILE="logs/daily_nba_updates_${D}_${TS}.log"

{
  echo "==========================================================="
  echo "DAILY NBA UPDATE"
  echo "Fecha objetivo: $D"
  echo "Timestamp: $TS"
  echo "Directorio: $APP_DIR"
  echo "==========================================================="

  echo ""
  echo "1) Actualizando full game con daily_update.py..."
  echo "-----------------------------------------------------------"

  if [[ -f "daily_update.py" ]]; then
    NBA_START_DATE="$D" \
    NBA_END_DATE="$D" \
    NBA_SEASON_TYPES="Regular Season,Playoffs,Play-In" \
    PYTHONUNBUFFERED=1 python3 -u daily_update.py
  else
    echo "⚠️ No encontré daily_update.py. Salteo full game."
    echo "⚠️ Ojo: si el full game no se actualiza, algunos partidos nuevos pueden no aparecer en el front."
  fi

  echo ""
  echo "2) Actualizando Q1 / H1 / H2_REG con daily_period_splits_pbp.py..."
  echo "-----------------------------------------------------------"

  PYTHONUNBUFFERED=1 python3 -u daily_period_splits_pbp.py \
    --source nba \
    --season 2025-26 \
    --start "$D" \
    --end "$D" \
    --splits Q1,H1,H2_REG \
    --target-table player_period_splits_v2 \
    --force

  echo ""
  echo "✅ Update terminado para $D"
  echo "Log guardado en: $LOG_FILE"

} 2>&1 | tee "$LOG_FILE"
