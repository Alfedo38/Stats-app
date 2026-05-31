# WNBA UI update — sin EV/cuotas

Este paquete agrega una estética nueva para WNBA sin tocar NBA.

## Qué incluye

- `components/wnba/*`: componentes propios WNBA.
- `app/wnba/page.tsx`: home WNBA nueva con partidos, estados, leaders y empty state mejorado.
- `app/wnba/players/page.tsx`: página nueva de listado/buscador de jugadoras.
- `app/wnba/players/[playerId]/page.tsx`: página de jugadora sin `PlayerChartContainer` NBA.

## Qué NO toca

- No toca componentes NBA.
- No usa EV.
- No usa cuotas.
- No usa Stake/Betano.
- No usa injury context.

## Cómo aplicar

Desde la raíz del proyecto:

```bash
cd ~/stats-app
cp -r /ruta/del/zip_descomprimido/components/wnba components/
cp -r /ruta/del/zip_descomprimido/app/wnba app/
```

O copiá el contenido del ZIP encima de `~/stats-app` manteniendo las rutas.

Después probá:

```bash
npm run build
# o
npm run dev
```

## Nota de BD

La página usa estas vistas existentes:

- `public.v_wnba_daily_games`
- `public.v_wnba_teams`
- `public.v_wnba_team_roster`
- `public.v_wnba_player_game_logs`

Si `player_game_stats` base sigue atrasada, puede que algunos logs base no muestren los últimos partidos aunque `daily_games` y advanced estén actualizados.
