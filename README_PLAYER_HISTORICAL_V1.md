# Player Page Historical V1

Este paquete agrega la primera integración real del histórico NBA de 5 años a la página de jugadores.

## Archivos nuevos

- `lib/histContext.ts`
  - Consulta `nba_api_data.fn_ludo_hist_pick_context_json`.
  - Devuelve contexto histórico para Over y Under.

- `app/api/hist-context/route.ts`
  - Endpoint POST usado por el front.
  - Recibe `playerName`, `market`, `line`, `opponent`, `homeAway`, `asOfDate`.

- `components/PlayerHistoricalContextPanel.tsx`
  - Panel visual de histórico 5 años.
  - Muestra score, grade, L5, L10, vs rival, home/away, global y explicación.

## Archivos modificados

- `components/PlayerChart.tsx`
  - Mantiene el fix sin `ResponsiveContainer`.
  - Usa medición propia con `ResizeObserver`.
  - Recupera overlay punteado para `potential_ast` y `rebound_chances`.

- `components/PlayerChartContainer.tsx`
  - Saca `key` y `chart-animate` del wrapper del gráfico.
  - Memoiza `processedStats`.
  - Evita que Supporting Data use datos ya filtrados.
  - Agrega reset visual para sliders.
  - Renderiza `PlayerHistoricalContextPanel`.

- `components/SupportingDataGrid.tsx`
  - Agrega `resetToken`.
  - Los sliders se resetean cuando se limpian filtros o cambia la métrica.

- `components/PlayerPageContent.tsx`
  - Pasa próximo rival / home-away / fecha al contenedor.

- `app/players/[playerId]/page.tsx`
  - Pasa `nextOpponent`, `nextHomeAway` y `nextGameDate`.

## Cómo instalar

```bash
cd ~/Descargas
unzip player-page-historical-v1.zip -d player-page-historical-v1

cp -r player-page-historical-v1/* ~/stats-app/

cd ~/stats-app
rm -rf .next
npm run dev
```

## Qué probar primero

1. Abrir un jugador con mercado PTS/REB/AST/PRA.
2. Verificar que las barras sigan apareciendo.
3. En AST verificar que vuelva la línea punteada `Pot. AST`.
4. En REB verificar que vuelva la línea punteada `Chances Reb.`.
5. Debajo del veredicto debe aparecer el panel `Histórico 5 años`.
6. Probar cambiar línea y stat para ver si recalcula el histórico.

## Requisito de DB

No requiere migración nueva. Usa funciones ya creadas en:

- `nba_api_data.fn_ludo_hist_pick_context_json`

Y vistas/datos históricos ya existentes:

- `nba_api_data.v_ludo_hist_player_games`
- `nba_api_data.v_ludo_hist_player_form`
- `nba_api_data.v_ludo_hist_player_vs_opponent`
- `nba_api_data.v_ludo_hist_player_home_away`

## Nota

El histórico 5 años sirve para PTS, REB, AST, PRA, PR, PA, RA y 3PT. Para métricas como Usage, Touches, Potential AST o Rebound Chances, el panel muestra que no está disponible porque esas métricas viven en la capa actual, no en el histórico largo.
