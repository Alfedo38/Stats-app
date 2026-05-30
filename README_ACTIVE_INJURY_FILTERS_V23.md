# Player Page v23 — Bajas activas en filtros + W/O robusto

## Qué corrige

- Mueve/asegura el bloque **Bajas activas** dentro del panel derecho de filtros, más arriba y visible.
- Mantiene los botones:
  - **Ver W/O**: abre modal con partidos exactos desde `public.v_ludo_wo_games_modal`.
  - **Aplicar**: activa el filtro `woTeammate` para recalcular gráfico, resumen y tabla.
- El botón **Reset** limpia también el filtro W/O.
- `getPlayerActiveInjuryContext()` ahora tiene fallback de fecha ±2 días para evitar que el panel quede vacío por desfasaje de fecha/timezone.
- Mantiene protección contra BigInt en endpoints.

## Archivos incluidos

- `components/PlayerChartContainer.tsx`
- `components/ActiveInjuryContextCard.tsx`
- `components/PlayerHistoricalExplorer.tsx`
- `components/PlayerPageContent.tsx`
- `app/players/[playerId]/page.tsx`
- `app/api/active-injury-context/route.ts`
- `app/api/player-history/route.ts`
- `app/api/wo-games/route.ts`
- `lib/api.ts`
- `lib/playerHistory.ts`

## Instalación

```bash
cd ~/Descargas
unzip player-page-active-injury-filters-v23.zip -d player-page-active-injury-filters-v23
cp -r player-page-active-injury-filters-v23/* ~/stats-app/
cd ~/stats-app
rm -rf .next
npm run dev
```

## Pruebas

1. Endpoint:

```txt
/api/active-injury-context?playerId=1628983&gameDate=2026-05-30
```

2. Player page de Shai:

- Panel derecho → Bajas activas
- Jalen Williams OUT → Ver W/O
- Jalen Williams OUT → Aplicar

Debe aparecer chip `W/O Jalen Williams` y recalcular histórico/gráfico/tabla.
