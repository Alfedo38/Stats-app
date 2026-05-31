# WNBA line + bars fix

Cambio puntual sobre el panel de jugadoras WNBA:

- Las barras del gráfico ahora son siempre verdes/rojas.
  - Verde = acierto según el lado elegido.
  - Rojo = fallo según el lado elegido.
- La línea ya no permite valores raros como 18.4.
- La línea usa formato de apuesta `x.5`.
- Los botones `-` y `+` bajan/suben la línea de 1 en 1: 18.5 → 19.5 → 20.5.
- Se reemplazó el input libre por selector de líneas para evitar valores confusos.

No toca NBA. Solo reemplaza:

components/wnba/WNBAPlayerChartPanel.tsx
