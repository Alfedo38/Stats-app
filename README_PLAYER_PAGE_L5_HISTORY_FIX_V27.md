# Player Page L5 history fix v27

Corrige el bug donde el botón L5 quedaba seleccionado pero el gráfico seguía mostrando 20 partidos.

Causa:
`lib/playerHistory.ts` forzaba un mínimo de 20 partidos en `limit`, entonces `/api/player-history` ignoraba `limit: 5`.

Cambio:
- Permite `limit` desde 1 hasta 1000.
- L5 devuelve 5 partidos.
- L10 devuelve 10 partidos.
- L20 devuelve 20 partidos.
- L30 devuelve 30 partidos.

Instalación:

```bash
cd ~/Descargas
unzip player-page-l5-history-fix-v27.zip -d player-page-l5-history-fix-v27
cp -r player-page-l5-history-fix-v27/* ~/stats-app/
cd ~/stats-app
rm -rf .next
npm run dev
```

Prueba:
- Abrir Shai.
- Elegir L5.
- Confirmar que el panel dice Partidos 5.
- Confirmar que el gráfico muestra 5 barras.
- Cambiar L10/L20/L30 y confirmar que cambia la cantidad real de barras.
