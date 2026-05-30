# PlayerChart tooltip fix v12

Este patch corrige el bug donde al filtrar por un mismo rival, por ejemplo `VS OKC`, el eje X repetía `OKC` en todas las barras y Recharts podía mostrar en el tooltip una fila equivocada o valor `0`.

## Cambios

- `XAxis` ahora usa `_xKey`, una clave única por partido.
- El eje sigue mostrando el rival mediante `_xLabel`.
- El tooltip fuerza el payload de la barra `value`, no el primer payload disponible.
- El valor del tooltip usa `formatNumber`.

## Instalación

```bash
cd ~/Descargas
unzip playerchart-tooltip-xkey-v12.zip -d playerchart-tooltip-xkey-v12
cp -r playerchart-tooltip-xkey-v12/* ~/stats-app/
cd ~/stats-app
rm -rf .next
npm run dev
```
