# Betano Hitos + Ludo EV

Este pack arma un flujo separado para cuotas Betano NBA, enfocado en **mercados de hitos**.

## Flujo recomendado

```bash
# 1) Scrapeás Betano con tu script actual
python3 scraperb.py

# 2) Procesás SOLO hitos y normalizás líneas tipo 24+ => model_line 23.5
python3 procesar_betano_hitos.py --source-tz America/Argentina/Buenos_Aires

# 3) Revisás antes de subir
python3 subir_cuotas_betano_hitos.py --db ludo.db --dry-run

# 4) Subís cuotas a SQLite
python3 subir_cuotas_betano_hitos.py --db ludo.db

# 5) Corrés tu modelo Ludo como ya lo venías haciendo
python3 generar_predicciones_ludo.py --save-db

# 6) Generás picks Betano hitos
python3 generar_picks_betano_hitos_ludo.py --db ludo.db --pred-table ludo_predictions --dry-run --top 20

# 7) Guardás picks
python3 generar_picks_betano_hitos_ludo.py --db ludo.db --pred-table ludo_predictions --save-db --top 20
```

## Si tu tabla de predicciones no se llama `ludo_predictions`

Pasá el nombre real:

```bash
python3 generar_picks_betano_hitos_ludo.py --db ludo.db --pred-table TU_TABLA --dry-run --top 20
```

## Si tus columnas tienen otros nombres

Ejemplo:

```bash
python3 generar_picks_betano_hitos_ludo.py \
  --db ludo.db \
  --pred-table predicciones_ludo \
  --player-col jugador \
  --stat-col mercado \
  --mean-col prediccion \
  --std-col sigma \
  --dry-run --top 20
```

## Qué mercados toma

- Puntos (hitos)
- Rebotes (hitos)
- Asistencias (hitos)
- Triples (hitos)
- PRA (hitos)
- RA (hitos)
- Robos (hitos)
- Tapones (hitos)

## Conversión clave

`24+` se transforma en:

- `threshold = 24`
- `model_line = 23.5`
- evento: `P(X > 23.5)`

Esto es mejor para comparar contra una proyección media y una distribución normal aproximada.
