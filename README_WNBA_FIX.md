# WNBA UI Fix

Este paquete reemplaza la versión anterior de WNBA.

Cambios:
- Home `/wnba` simplificada: solo partidos del día + líderes de jugadoras.
- Página `/wnba/players` con búsqueda y orden por stats.
- Página `/wnba/players/[playerId]` sin textos extra de perfil/origen.
- Nuevo `WNBAPlayerChartPanel` con barras, filtros por stat, línea, L5/L10/L15/L20, rival, local/visitante y minutos.
- No usa EV, cuotas, Stake ni Betano.
- No modifica NBA.

Archivos incluidos:
- app/wnba/page.tsx
- app/wnba/players/page.tsx
- app/wnba/players/[playerId]/page.tsx
- components/wnba/WNBAPlayerChartPanel.tsx
