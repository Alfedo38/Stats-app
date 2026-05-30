# Player Page Performance / Local State v28

Objetivo: volver la Player Page más rápida y estable en local y Vercel.

## Cambios principales

- La URL se usa solo para inicializar la página.
- Los filtros ya no hacen `router.replace()` en cada click.
- Línea, stat, L5/L10/L20/L30, rival, minutos, local/visitante y W/O quedan en estado local rápido.
- El botón Compartir genera una URL completa con el estado actual.
- Las líneas Stake del panel izquierdo cambian la línea del gráfico mediante evento local, sin tocar la URL.
- Se mantiene el fix L5 real en `lib/playerHistory.ts`.

## Archivos

- `hooks/usePlayerUrlState.ts`
- `components/PlayerChartContainer.tsx`
- `components/TeamMatesPanel.tsx`
- `lib/playerHistory.ts`

## Prueba recomendada

1. Abrir jugador.
2. Cambiar L5 / L10 / L20 / L30.
3. Cambiar línea Stake desde el panel izquierdo.
4. Aplicar rival, minutos y W/O.
5. Confirmar que todo cambia rápido sin que la URL cambie en cada click.
6. Usar Compartir para copiar un link completo del estado actual.
