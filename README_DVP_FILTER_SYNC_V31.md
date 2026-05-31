# Player Page DVP Filter Sync v31

Corrige el bug donde Defensa vs Posición quedaba congelado en OKC u otro rival anterior.

## Cambios

- `PlayerChartContainer` avisa al layout cuando cambia el rival del filtro.
- `PlayerPageContent` escucha ese cambio y actualiza `DvpPanel`.
- DVP ahora prioriza el rival filtrado.
- Si no hay filtro, usa último rival del jugador antes que un próximo partido posiblemente desalineado.
- Cambiar el filtro de equipo debería cambiar gráfico/resumen/tabla y también el DVP.

## Instalación

```bash
cd ~/Descargas
unzip player-page-dvp-filter-sync-v31.zip -d player-page-dvp-filter-sync-v31
cp -r player-page-dvp-filter-sync-v31/* ~/stats-app/
cd ~/stats-app
rm -rf .next
npm run dev
```

## Prueba

1. Abrí Luka o Shai.
2. Cambiá Rival a SAS / OKC / LAL.
3. Confirmá que el panel Defensa vs posición cambia al mismo rival.
