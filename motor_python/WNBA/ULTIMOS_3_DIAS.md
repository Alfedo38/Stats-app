# WNBA: actualización de los últimos 3 días

La ventana incluye hoy en Argentina y los dos días anteriores. Se comparan por
`game_id` las tablas `games`, `team_game_stats`, `player_game_stats` y
`player_game_stats_advanced`. Solo se descargan box scores incompletos y solo se
insertan filas que todavía no existen.

## Prueba sin escritura

```bash
cd /home/alfedo/stats-app/motor_python/WNBA

../.venv/bin/python wnba_last_3_days.py \
  --season 2026 \
  --days 3 \
  --dry-run
```

## Prueba real con un solo partido

```bash
../.venv/bin/python wnba_last_3_days.py \
  --season 2026 \
  --days 3 \
  --max-games 1 \
  --apply
```

## Ejecución completa

```bash
../.venv/bin/python wnba_last_3_days.py \
  --season 2026 \
  --days 3 \
  --apply
```

Cada corrida conserva un CSV pequeño en `incremental_runs/` con únicamente las
filas nuevas de esa ejecución. Nunca lee ni reescribe `wnba_data/`.

## Automatización sugerida

Dar permiso una sola vez:

```bash
chmod +x /home/alfedo/stats-app/motor_python/WNBA/run_wnba_last_3_days.sh
```

En `crontab -e`, ejecutar todos los días a las 13:20:

```cron
20 13 * * * /usr/bin/flock -n /tmp/wnba_last_3_days.lock /home/alfedo/stats-app/motor_python/WNBA/run_wnba_last_3_days.sh
```
