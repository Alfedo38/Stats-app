# Player Page Timeout Fix

Este parche corrige el timeout de:

`Error leyendo v_ludo_player_game_logs_clean_periods_v2: canceling statement due to statement timeout`

## Cambios

1. `lib/api.ts`
   - `getPlayerData()` ya no usa `supabase.from('v_ludo_player_game_logs_clean_periods_v2').select('*')`.
   - Usa `prisma.player_game_logs.findMany({ take: 120 })`, que es más rápido.
   - Carga Q1/H1/H2 aparte desde `nba_api_data.v_player_period_splits_front_v2`.
   - Si los splits fallan, no rompe el gráfico FULL ni los potenciales.

2. `app/players/[playerId]/page.tsx`
   - `generateMetadata()` ya no llama a `getPlayerData()`, evitando doble consulta pesada por cada página.
   - Se corrigió un duplicado menor de `lastName`.

## Instalar

```bash
cd ~/Descargas
unzip player-page-timeout-fix-v2.zip -d player-page-timeout-fix-v2
cp -r player-page-timeout-fix-v2/* ~/stats-app/
cd ~/stats-app
rm -rf .next
npm run dev
```

## Probar

Abrir:

`/players/1642264?n=20&stat=reb&scope=FULL&line=5.5`

La consola ya no debería mostrar `statement timeout` de `v_ludo_player_game_logs_clean_periods_v2`.
