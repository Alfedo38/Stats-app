# Actualización incremental WNBA

Este proceso reemplaza, para el uso diario, a `run_daily_wnba_full_update.sh` y a
`sync_wnba_daily_games.py` (ESPN responde 403). No borra ni recarga las tablas completas.

## 1. Prueba sin escritura

```bash
cd /home/alfedo/stats-app/motor_python/WNBA
../.venv/bin/pip install -r requirements_wnba_incremental.txt

../.venv/bin/python wnba_incremental_update.py \
  --mode probe \
  --season 2026 \
  --max-games 1
```

El probe compara `game_id` con Supabase, prueba un box score pendiente y hace rollback.

## 2. Prueba controlada de tres partidos

```bash
../.venv/bin/python wnba_incremental_update.py \
  --mode backfill \
  --season 2026 \
  --max-games 3 \
  --skip-season-snapshots
```

Comprobar conteos y fechas en Supabase. Si están bien, ejecutar el backfill completo.

## 3. Backfill completo 2026

```bash
../.venv/bin/python wnba_incremental_update.py \
  --mode backfill \
  --season 2026
```

Cada ejecución crea `incremental_runs/<modo>_<temporada>_<fecha>/` con solamente las
filas descargadas en esa corrida. `wnba_data/` no se lee ni se modifica.

### Recuperar una descarga si Supabase cortó la conexión

No hace falta volver a consultar los box scores. Indicá la carpeta que el proceso
mostró antes del error:

```bash
../.venv/bin/python wnba_incremental_update.py \
  --upload-run ./incremental_runs/backfill_2026_YYYYMMDD_HHMMSS \
  --schema wnba_api_data
```

El modo de recuperación abre una conexión nueva, vuelve a leer únicamente los CSV
de esa corrida y conserva la carga completa dentro de una transacción.

## 4. Automatización diaria

```bash
chmod +x run_daily_wnba_incremental.sh
mkdir -p /home/alfedo/stats-app/logs
```

Agregar con `crontab -e`:

```cron
20 13 * * * /usr/bin/flock -n /tmp/wnba_incremental.lock /home/alfedo/stats-app/motor_python/WNBA/run_daily_wnba_incremental.sh
```

No activar todavía el viejo `run_daily_wnba_full_update.sh`: reemplaza `wnba_stage`,
depende del CSV mixto de temporada y vuelve a recorrer datos históricos.

## Alcance

- Actualiza partidos terminados, box scores tradicionales y avanzados.
- Refresca planteles y snapshots acumulados de la temporada actual.
- Reintenta automáticamente cualquier partido cuyo box score haya fallado.
- No obtiene partidos futuros. El calendario del inicio se resolverá con una fuente
  separada para que una caída del calendario no bloquee las estadísticas.
