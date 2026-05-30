# Player Page UX v16 — Stake odds clarity

## Qué corrige

- Las cuotas Stake del panel izquierdo ahora se muestran en formato decimal: `1.36`, `2.56`, etc.
- Ya no aparece `O +1 / U +2`, que era confuso porque esas cuotas venían en formato decimal y se estaban redondeando como si fueran americanas.
- Las líneas duplicadas se agrupan: una sola fila por línea.
- Si hay varias cuotas para la misma línea, se conserva la mejor disponible para Over y la mejor disponible para Under.
- La tabla lateral queda más clara: `Línea | Over | Under`.

## Archivo modificado

- `components/TeamMatesPanel.tsx`

## Instalación

```bash
cd ~/Descargas
unzip player-page-ux-v16-stake-odds-clean.zip -d player-page-ux-v16-stake-odds-clean
cp -r player-page-ux-v16-stake-odds-clean/* ~/stats-app/
cd ~/stats-app
rm -rf .next
npm run dev
```
