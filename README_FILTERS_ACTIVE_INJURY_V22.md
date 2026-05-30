# Player Page v22 — filtros limpios + bajas activas W/O

## Qué corrige

- El panel de filtros queda más limpio y el botón Reset limpia todo:
  - Over/Under
  - Local/Visitante
  - Minutos
  - Rival
  - W/O compañero
  - filtros internos de supporting data
- Al cambiar de jugador, mercado o scope, los filtros vuelven a cero para evitar filtros random heredados.
- Si `activeInjuryContext` no llega desde el server, el cliente intenta cargarlo desde:
  `/api/active-injury-context?playerId=...&gameDate=...`
- Mantiene el modal `Ver W/O` usando `/api/wo-games`.
- Mantiene `woTeammate` en `/api/player-history` para recalcular gráfico/resumen/tabla con la muestra W/O.

## Instalación

```bash
cd ~/Descargas
unzip player-page-filters-active-injury-v22.zip -d player-page-filters-active-injury-v22
cp -r player-page-filters-active-injury-v22/* ~/stats-app/
cd ~/stats-app
rm -rf .next
npm run dev
```

## Test

- `/api/active-injury-context?playerId=1628983&gameDate=2026-05-30`
- `/api/wo-games?playerId=1628983&absentTeammate=Jalen%20Williams`
- Página de Shai: filtros → bajas activas → Ver W/O / Aplicar.
