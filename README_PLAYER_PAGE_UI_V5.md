# Player Page UI v5 — histórico unificado + bio pro

## Qué corrige

1. **Histórico por nombre, no por ID primero**
   - Antes el histórico podía cruzar mal jugadores cuando el `player_id` actual no coincidía con el histórico NBA API.
   - Ahora se busca primero por `player_name` exacto y luego por tokens de nombre.
   - El ID solo queda como fallback cuando no hay nombre.

2. **Vista unificada opcional para todos los años + temporada actual**
   - Agrega `sql/20260528_player_page_unified_history.sql`.
   - Une `nba_api_data.v_ludo_hist_player_games` con `public.player_game_logs`.
   - Evita duplicados.
   - Permite que rookies o partidos recientes también aparezcan en el explorador histórico.

3. **Histórico visual filtrado**
   - El panel histórico ahora muestra una tira de barras de colores con los partidos filtrados.
   - Verde = hit.
   - Rojo = miss.
   - Línea amarilla = línea seleccionada.

4. **Filtro MIN mejorado**
   - Ahora suma botón `MIN ≥ 40`.
   - El filtro de minutos ya no deja pasar partidos sin minutos cargados cuando se activa.

5. **Header del jugador mejorado**
   - Posición grande.
   - Dorsal.
   - Altura, peso, edad, país y origen si existen en `nba_historical.players`.
   - Imagen si ya existe en `public.players.image_url`.

## Instalación

```bash
cd ~/Descargas
unzip player-page-ui-upgrade-v5-patch.zip -d player-page-ui-upgrade-v5-patch
cp -r player-page-ui-upgrade-v5-patch/* ~/stats-app/
cd ~/stats-app
rm -rf .next
npm run dev
```

## SQL recomendado

Ejecutar en Supabase SQL Editor:

```sql
-- archivo incluido:
-- sql/20260528_player_page_unified_history.sql
```

Sin este SQL el panel sigue funcionando usando `nba_api_data.v_ludo_hist_player_games`, pero no suma los partidos actuales de `public.player_game_logs` al histórico.

## Test recomendado

1. Abrir Victor Wembanyama.
2. En histórico seleccionar `Completo`.
3. Probar `MIN ≥ 35` y `MIN ≥ 40`.
4. Buscar `VS OKC`.
5. Confirmar que el panel dice `Match: name_exact` o `name_tokens`, no `player_id`.
6. Confirmar que el header muestra posición grande y, si la tabla tiene datos, altura/peso/edad.
