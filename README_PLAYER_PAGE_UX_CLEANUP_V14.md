# Player Page UX Cleanup v14

Este patch limpia la composición visual de la player page sin tocar la base de datos.

## Cambios

- El panel de filtros globales queda como sidebar compacto y vertical.
- Se eliminan textos largos que se cortaban o quedaban en columnas angostas.
- El filtro de minutos queda compacto con slider + botones rápidos.
- El filtro de rival queda compacto con buscador y sugerencias.
- Over/Under y Local/Visitante quedan como toggles simples.
- El panel grande de Stake/Alt Lines al lado del gráfico se reemplaza por chips compactos arriba del gráfico.
- Se elimina la tabla de odds duplicada debajo para que Stake no ocupe media página.
- El gráfico recupera ancho y queda más protagonista.

## Instalación

```bash
cd ~/Descargas
unzip player-page-ux-cleanup-v14-patch.zip -d player-page-ux-cleanup-v14-patch
cp -r player-page-ux-cleanup-v14-patch/* ~/stats-app/
cd ~/stats-app
rm -rf .next
npm run dev
```

## Archivo modificado

- components/PlayerChartContainer.tsx
