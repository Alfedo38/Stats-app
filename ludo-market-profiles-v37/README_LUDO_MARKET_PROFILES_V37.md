# Ludo v37 — Market Profiles

Este patch cambia `generar_picks_ludo.py` para que Ludo no trate todos los mercados con la misma regla.

## Cambios principales

- FGA / FG3A / FTA pasan a perfil `VOLUME_SAFE`.
- PTS / FGM / 3PT / FTM pasan a perfil `SCORING_RESULT`.
- PRA / PR / PA / RA pasan a perfil `COMBO_TOTAL`.
- REB / AST / TOV pasan a perfil `COUNTING_STABLE`.
- PF pasa a `COUNTING_RISK`.
- STL / BLK / STL+BLK pasan a `DEFENSIVE_RISK`.
- Q1 queda como `Q1_VOLATILE`.

## Reglas destacadas

- FGA/FG3A/FTA pueden entrar con cuota 1.10 si tienen soporte fuerte: L5 perfecto o casi perfecto, L10 alto, edge fuerte y margen suficiente contra MAE.
- PTS/FGM/3PT/FTM piden más margen porque dependen de conversión.
- PRA/PR/PA/RA piden mejores cuotas porque tienen MAE más alto.
- REB/AST/TOV pueden entrar como principales si cumplen soporte.
- PF/STL/BLK/STL+BLK quedan primero como radar.

## Tickets nuevos

- `Volumen seguro OVER/UNDER/MIX X2/X3`
- `Conteos estables X2/X3`
- `Anotación controlada X2`
- `Combinadas estadísticas X2`
- `Radar defensivo X2`

## Cómo probar

```bash
cd ~/Descargas
unzip ludo-market-profiles-v37.zip -d ludo-market-profiles-v37
cp -r ludo-market-profiles-v37/* ~/stats-app/

cd ~/stats-app/motor_python
python3 generar_picks_ludo.py --dry-run --top 100
```

Revisar especialmente:

- Que FGA aparezca en tickets de volumen seguro si cumple.
- Que no aparezcan nombres tipo dinamita/fuerte/mega.
- Que STL/BLK/STL+BLK/PF queden radar o tickets defensivos, no tickets conservadores principales.
- Que TOV pueda aparecer como conteo estable.
