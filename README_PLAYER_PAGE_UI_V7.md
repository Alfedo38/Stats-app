# Player Page UI v7

Cambios principales:

1. El gráfico principal ya no muestra opciones separadas de fuente como `Actual / Hist. 2 temp. / Hist. completo`.
2. En `FULL`, si la métrica tiene mercado histórico (PTS, REB, AST, PRA, PR, PA, RA, 3PT), el gráfico usa el histórico completo unificado automáticamente.
3. En `Q1 / H1 / H2`, el gráfico usa la data actual de period splits para no romper los parciales.
4. Se agregó soporte real para `L30` en `hooks/usePlayerUrlState.ts`.
5. Se agregó botón `TODO` para ver toda la muestra disponible del histórico filtrado.
6. El panel histórico de abajo queda como tabla/resumen completo con filtros, sin botones de modo `2 temp. / completo`.
7. Los filtros que quedan son los útiles: Over/Under, MIN, VS equipo y ventanas L5/L10/L20/L30/TODO.

Instalación:

```bash
cd ~/Descargas
unzip player-page-ui-upgrade-v7-patch.zip -d player-page-ui-upgrade-v7-patch
cp -r player-page-ui-upgrade-v7-patch/* ~/stats-app/
cd ~/stats-app
rm -rf .next
npm run dev
```

Importante:
- Si no ejecutaste el SQL de v5/v6, ejecutá `sql/20260528_player_page_unified_history.sql` en Supabase.
- Para FULL, el gráfico ahora prioriza el histórico completo. Para Q1/H1/H2 se mantiene la data actual.
