#!/usr/bin/env bash
set -euo pipefail

cd /home/alfedo/stats-app

mkdir -p /home/alfedo/stats-app/logs

{
  echo "==========================================================="
  echo "RUN DAILY POT - $(date '+%Y-%m-%d %H:%M:%S')"
  echo "==========================================================="
} >> /home/alfedo/stats-app/logs/daily_pot.log

/usr/bin/flock -n /tmp/daily_pot.lock \
  /usr/bin/python3 /home/alfedo/stats-app/daily_pot.py \
    --upload-db \
    --season-types "Regular Season,Playoffs,PlayIn" \
    --lookback-days 3 \
    --targets public.player_game_logs \
    --only-missing \
    --skip-zero \
  >> /home/alfedo/stats-app/logs/daily_pot.log 2>&1
