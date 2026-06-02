# Ludo Picks Quality Gate v36

Este patch actualiza `motor_python/generar_picks_ludo.py` para trabajar mejor con los modelos v35 de 18 mercados.

## Cambios principales

- Lee `allow_main` desde `modelos_ai/ludo_model_registry.json` o `modelos_ai_v35/ludo_model_registry.json`.
- Fuerza `BLK`, `STL`, `STL+BLK` y `PF` como mercados `RADAR_ONLY`.
- Habilita `TOV` como mercado principal.
- Usa historial gold desde `nba_api_data.v_ludo_train_all_markets_gold` para calcular hit rate también en `BLK`, `STL`, `STL+BLK`, `TOV` y `PF`.
- Tickets principales solo aceptan cuotas `>= 1.20`.
- Radar sigue aceptando cuotas desde `1.10`.
- Evita que mercados `allow_main=false` entren en tickets principales.
- Mantiene esos mercados visibles como radar/auditoría.
- Limpia nombres de tickets para sacar etiquetas exageradas.

## Instalación

```bash
cd ~/Descargas
unzip ludo-picks-quality-gate-v36.zip -d ludo-picks-quality-gate-v36
cp -r ludo-picks-quality-gate-v36/* ~/stats-app/
cd ~/stats-app/motor_python
```

## Prueba segura

```bash
python3 generar_picks_ludo.py --dry-run --top 80
```

Verificar:

- Que cargue predicciones del último run.
- Que `BLK`, `STL`, `STL+BLK` y `PF` aparezcan como radar, no como tickets principales.
- Que tickets principales no usen cuotas menores a 1.20.
- Que `TOV` pueda aparecer como mercado principal si cumple filtros.

## Producción

Cuando el dry-run se vea bien:

```bash
python3 generar_picks_ludo.py
```
