# Player Page UI v10

## Objetivo
Usar las vistas gold limpias:

- `nba_api_data.v_player_page_game_fact`
- `nba_api_data.v_player_bio_unified`

Esto corrige:

- Wemby/SAS mostrando SAS como rival.
- Filtro VS equipo usando `opponent_clean`.
- Header sin altura/peso/edad/país aunque los datos estén en `nba_historical.player_bio` y `nba_historical.player_biostats`.

## Instalar

```bash
cd ~/Descargas
unzip player-page-ui-upgrade-v10-patch.zip -d player-page-ui-upgrade-v10-patch
cp -r player-page-ui-upgrade-v10-patch/* ~/stats-app/
cd ~/stats-app
rm -rf .next
npm run dev
```

## SQL requerido
Ejecutar en Supabase SQL Editor:

```txt
sql/20260529_player_page_gold_views.sql
```

## Pruebas recomendadas

```sql
SELECT game_date, player_name, team_abbreviation, opponent_clean, matchup_clean, pts, reb, ast, min
FROM nba_api_data.v_player_page_game_fact
WHERE player_name ILIKE '%wemb%'
ORDER BY game_date DESC
LIMIT 50;

SELECT *
FROM nba_api_data.v_player_bio_unified
WHERE player_name ILIKE '%wemb%'
LIMIT 5;
```

En la página:

- Wemby + VS Thunder/OKC.
- Wemby + MIN >= 40.
- Local / Visitante.
- Header debe mostrar altura/peso/edad/país/origen si existen.
