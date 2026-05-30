# Player Page UX/Bugfix v13

Este patch corrige bugs visuales y reordena la experiencia de análisis sin tocar el filtro W/O de lesionados.

## Cambios principales

1. Fechas sin bug de timezone
   - `2026-05-20` ya no debería mostrarse como `19/05`.
   - Se agregan helpers `normalizeDateOnly`, `formatDateOnly` y `getDateSortValue`.

2. Temporadas normalizadas
   - `22025` / `22024` se muestran como `2025-26` / `2024-25`.
   - Se agrega `formatSeasonLabel`.

3. Gráfico principal
   - Tooltip usa fecha correcta, minutos limpios y payload de barra.
   - Si filtrás vs un mismo rival, el eje X muestra fechas compactas en vez de repetir `OKC OKC OKC`.
   - Mantiene clave interna única para evitar que Recharts muestre otro partido o valor 0.

4. Tabla histórica
   - Fecha correcta.
   - Temporada legible.
   - MIN limpio (`37.6`, `48.7`, etc.).
   - Usa `matchup_clean`, `opponent_clean`, `home_away_clean` cuando existen.

5. Layout
   - En desktop, filtros globales pasan a panel lateral sticky derecho.
   - El gráfico queda más arriba y con más protagonismo.
   - En pantallas chicas mantiene flujo vertical.

6. Helpers compartidos
   - Se agrega/actualiza `lib/playerUtils.ts` con helpers compatibles y sin bug de fecha.

## Instalación

```bash
cd ~/Descargas
unzip player-page-ux-bugfix-v13-patch.zip -d player-page-ux-bugfix-v13-patch
cp -r player-page-ux-bugfix-v13-patch/* ~/stats-app/

cd ~/stats-app
rm -rf .next
npm run dev
```

## Probar

- Wemby + VS Thunder / OKC.
- MIN ≥ 40.
- Revisar que el tooltip no muestre 0 incorrecto.
- Revisar que 2026-05-20 se muestre 20/05, no 19/05.
- Revisar tabla: temporadas `2025-26`, no `22025`.
