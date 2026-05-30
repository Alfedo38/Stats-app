# Player Page Active Injury W/O Filter v21

## Qué agrega

- Modal **Ver W/O** para abrir partidos exactos desde `public.v_ludo_wo_games_modal` solo cuando el usuario lo pide.
- Botón **Aplicar** en cada baja activa para filtrar gráfico/resumen/tabla histórica por `W/O <compañero>`.
- Endpoint nuevo `/api/wo-games?playerId=1628983&absentTeammate=Jalen%20Williams`.
- `/api/player-history` acepta `woTeammate` y filtra la muestra histórica contra los game_id/game_date de `v_ludo_wo_games_modal`.
- Protecciones contra `BigInt` en JSON.

## Archivos tocados

- `components/ActiveInjuryContextCard.tsx`
- `components/PlayerChartContainer.tsx`
- `components/PlayerHistoricalExplorer.tsx`
- `app/api/wo-games/route.ts`
- `app/api/player-history/route.ts`
- `app/api/active-injury-context/route.ts`
- `lib/playerHistory.ts`

## Requisitos DB

Deben existir:

- `public.v_ludo_active_injury_context`
- `public.v_ludo_wo_games_modal`

La vista modal debe tener como mínimo:

- `player_id`
- `absent_teammate`
- `game_date`
- preferentemente `game_id`

## Pruebas rápidas

```txt
/api/active-injury-context?playerId=1628983&gameDate=2026-05-30
/api/wo-games?playerId=1628983&absentTeammate=Jalen%20Williams
```

En la Player Page:

1. Abrir jugador con contexto activo.
2. Panel derecho → Bajas activas.
3. Click en **Ver W/O** para ver partidos exactos.
4. Click en **Aplicar** para filtrar gráfico + tabla histórica.
