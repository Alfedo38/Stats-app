# Player Page UI v11 — minutos limpios + header sin imagen

## Cambios

1. `nba_api_data.v_player_page_game_fact` ahora expone:
   - `min_clean`: minutos redondeados a 1 decimal.
   - `min_display`: texto listo para UI.

2. Se agregó `lib/formatters.ts` con helpers únicos:
   - `formatNumber()`
   - `formatMinutes()`
   - `getMinutesValue()`
   - `roundNumber()`

3. El front deja de mostrar floats largos como:
   - `37.599998474121094`
   - `48.70000076293945`

   y muestra:
   - `37.6`
   - `48.7`

4. El header ya no carga imagen del jugador desde CDN ni desde `imageUrl`.
   - Ahora usa una tarjeta visual con iniciales + posición.
   - Evita requests rotos, imágenes faltantes o problemas visuales.

5. El gráfico, tooltip, supporting data y tabla histórica usan minutos limpios.

## Instalación

```bash
cd ~/Descargas
unzip player-page-ui-upgrade-v11-patch.zip -d player-page-ui-upgrade-v11-patch
cp -r player-page-ui-upgrade-v11-patch/* ~/stats-app/
cd ~/stats-app
rm -rf .next
npm run dev
```

## SQL

Ejecutar en Supabase:

```txt
sql/20260529_player_page_gold_views.sql
```

Esto actualiza `v_player_page_game_fact` con `min_clean` y `min_display`.
