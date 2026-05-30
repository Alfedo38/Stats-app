# Player Page UX v15

Cambios principales:

- Mueve las líneas/cuotas Stake al panel izquierdo, debajo del jugador actual.
- El gráfico deja de cargar chips grandes de alt-lines arriba; queda más limpio.
- Cada línea Stake del panel lateral cambia la `line` del gráfico vía URL.
- El panel izquierdo ahora separa mejor: equipo/buscador, jugador actual + líneas, roster.
- El nav principal se reemplaza por una versión compacta más limpia: 72px cerrado, expandible al hover.
- El layout se ajusta a `md:pl-[72px]` para calzar con el nuevo nav.

## Instalación

```bash
cd ~/Descargas
unzip player-page-ux-v15-patch.zip -d player-page-ux-v15-patch
cp -r player-page-ux-v15-patch/* ~/stats-app/
cd ~/stats-app
rm -rf .next
npm run dev
```

## Archivos modificados

- components/PlayerChartContainer.tsx
- components/TeamMatesPanel.tsx
- components/PlayerPageContent.tsx
- components/Sidebar.tsx
- app/layout.tsx
