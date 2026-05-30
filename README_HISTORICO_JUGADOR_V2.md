# Player Page histórico v2

Este patch separa la página de jugadores en dos motores:

1. **Actual 2025-26**
   - `public.player_game_logs`
   - `nba_api_data.v_player_period_splits_front_v2`
   - Mantiene potentials, usage, touches, rebound chances, Q1/H1/H2.

2. **Histórico largo**
   - `nba_api_data.v_ludo_hist_player_games`
   - Se consulta por `/api/player-history` solo cuando el panel histórico lo necesita.
   - Evita timeouts en `getPlayerData()`.

## Qué agrega

- Nuevo panel `PlayerHistoricalExplorer` debajo del gráfico/veredicto.
- Selector `Últimas 2 temp.` / `Histórico completo`.
- Filtros `MIN ≥ 20/25/30/35`.
- Buscador `VS equipo` usando todos los años disponibles cuando se elige modo completo.
- Resumen por temporada.
- Tabla histórica filtrada.
- Ya no muestra `0.000 EN_CONTRA` cuando no hay muestra: ahora muestra “Sin muestra suficiente”.

## Q1/H1/H2

`lib/api.ts` ahora carga FULL desde `public.player_game_logs` y une Q1/H1/H2 desde:

```sql
nba_api_data.v_player_period_splits_front_v2
```

El merge usa `game_id` normalizado sin ceros a la izquierda para evitar que se pierdan splits.

## Instalación

```bash
cd ~/Descargas
unzip player-page-historical-upgrade-v2-patch.zip -d player-page-historical-upgrade-v2-patch
cp -r player-page-historical-upgrade-v2-patch/* ~/stats-app/
cd ~/stats-app
rm -rf .next
npm run dev
```

## Pruebas recomendadas

1. Abrir un jugador con `?stat=pts&scope=FULL&line=18.5`.
2. Confirmar que las barras aparecen.
3. Probar `scope=Q1`, `scope=H1`, `scope=H2_REG`.
4. En el panel histórico, tocar `MIN ≥ 30`.
5. Buscar `VS OKC` o `VS SAS` y probar `Histórico completo`.
6. Si un rookie no tiene histórico, debe decir “Sin muestra suficiente”, no 0.000.
