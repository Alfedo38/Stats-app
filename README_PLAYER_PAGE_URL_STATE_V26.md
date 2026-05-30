# Player Page URL State Stability v26

Este patch estabiliza los filtros principales de la Player Page.

## Corrige

- Los filtros ya no quedan solo en estado local.
- `side`, `homeAway`, `min`, `opponent` y `wo` se guardan en URL.
- Cambiar una línea Stake preserva filtros activos.
- Cambiar línea, L5/L10/L20/L30 o stat no limpia filtros automáticamente.
- El reset limpia filtros reales y también la URL.
- El reset automático ya no borra filtros al cargar la página.

## Archivo modificado

- `components/PlayerChartContainer.tsx`

## Pruebas recomendadas

1. Aplicar VS OKC y MIN >= 30.
2. Cambiar línea desde Stake en panel izquierdo.
3. Confirmar que la URL conserva `opponent` y `min`.
4. Aplicar W/O Jalen Williams.
5. Cambiar L30/L20/L10/L5 y confirmar que W/O sigue activo.
6. Recargar página y confirmar que filtros permanecen.
