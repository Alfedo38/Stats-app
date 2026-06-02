# Player Page Performance v40

Objetivo: dejar el panel de compañeros rápido sin volver a bloquear el render inicial de `/players/[playerId]`.

## Cambios

- `/api/team-players` ya no usa la función pesada `getTeamPlayersForTeams`.
- Lee desde `public.player_page_game_fact_cache`, que ya está indexada y limpia.
- Calcula roster actual por último partido del jugador.
- Calcula hit rate usando los últimos 10 partidos desde la cache.
- Busca línea actual en `public.latest_player_prop_odds`.
- Cruza lesiones desde `public.nba_injuries`, pero sin bloquear si falla.
- Agrega cache en memoria del servidor por 5 minutos.
- Agrega cache HTTP con `s-maxage` y `stale-while-revalidate`.
- `PlayerPageContent` agrega cache cliente por 5 minutos y usa `fetch(..., { cache: "force-cache" })`.

## Instalación

```bash
cd ~/Descargas
unzip player-page-performance-v40.zip -d player-page-performance-v40
cp -r player-page-performance-v40/* ~/stats-app/
cd ~/stats-app
rm -rf .next
npm run dev
```

## SQL recomendado

Ejecutar en Supabase/DBeaver:

```sql
-- archivo incluido
sql/20260602_team_players_fast_indexes.sql
```

## Qué revisar en Network

- `/players/<id>` debería seguir rápido.
- `/api/team-players?...` debería aparecer después del document.
- En la respuesta, revisar header `X-Team-Players-Cache`:
  - `MISS`: primera consulta.
  - `HIT`: viene del cache en memoria.
  - `DEDUPED`: reutilizó una consulta en curso.

