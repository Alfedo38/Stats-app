# Player Page UI Upgrade v3

Este patch se aplica arriba del patch histórico v2.

## Cambios principales

1. Sidebar global compacto:
   - En desktop ocupa 80px en reposo.
   - Se expande al pasar el mouse.
   - El contenido principal pasa de `md:pl-64` a `md:pl-20`.

2. Columna izquierda de la Player Page:
   - Menos ancho: 280px.
   - Sticky controlado con `max-height` y scroll propio.
   - Evita que Injury Report se esconda al hacer scroll.

3. TeamMatesPanel:
   - Ya no es sticky por sí mismo.
   - La lista de jugadores tiene altura menor para dejar lugar al Injury Report.
   - Si seleccionás un partido, filtra de verdad a los equipos del partido.

4. Injury Report:
   - Altura controlada.
   - Scroll interno.
   - Header más compacto.

5. Supporting Data:
   - Sliders más visibles.
   - Track con progreso verde.
   - Tooltip para la estrella de correlación.
   - Cards menos gigantes en layout amplio.

6. Histórico avanzado:
   - Se movió debajo de Supporting Data y Odds para que no tape el gráfico principal.
   - Tabla histórica con header sticky y scroll interno.
   - Ya no duplica la columna PTS/REB/AST cuando el mercado analizado es esa misma stat.
   - Muestra calidad de muestra: baja/media/fuerte.

## Instalación

```bash
cd ~/Descargas
unzip player-page-ui-upgrade-v3-patch.zip -d player-page-ui-upgrade-v3-patch
cp -r player-page-ui-upgrade-v3-patch/* ~/stats-app/
cd ~/stats-app
rm -rf .next
npm run dev
```

## Qué probar

- Navegación izquierda: debe ocupar mucho menos y expandirse con hover.
- Player page: Injury Report no debe desaparecer al scrollear.
- Q1/H1/H2: deben seguir funcionando.
- Supporting Data: sliders más claros.
- Histórico: tabla más limpia y sin columnas duplicadas.
