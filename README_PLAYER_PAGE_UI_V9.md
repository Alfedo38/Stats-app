# Player Page UI v9

Patch enfocado en mejorar los filtros globales sin tocar la lógica de Q1/H1/H2 ni la conexión histórica.

## Cambios principales

1. Filtro de equipos más intuitivo
   - Ya no hace falta saber abreviaciones.
   - Podés buscar por nombre: Thunder, Lakers, Spurs, Knicks, etc.
   - También acepta abreviación: OKC, LAL, SAS.
   - Muestra botones de sugerencias con abreviación + nombre corto.

2. Filtro de minutos con barra móvil
   - Reemplaza los botones sueltos de MIN por un slider 0–48.
   - Mantiene accesos rápidos: Todos, 20, 25, 30, 35, 40.
   - El filtro afecta gráfico, resumen y tabla histórica.

3. Over/Under y Local/Visitante movidos a controles compactos
   - Ahora quedan en una zona separada del buscador de equipo y del slider.
   - La lectura queda más limpia.

4. Tabla histórica sincronizada
   - PlayerHistoricalExplorer ahora recibe side, minMinutes, opponent y homeAway desde los filtros globales.
   - La tabla de abajo usa la misma muestra que el gráfico/resumen.

## Instalación

```bash
cd ~/Descargas
unzip player-page-ui-upgrade-v9-patch.zip -d player-page-ui-upgrade-v9-patch
cp -r player-page-ui-upgrade-v9-patch/* ~/stats-app/
cd ~/stats-app
rm -rf .next
npm run dev
```

## Pruebas recomendadas

- Buscar rival por nombre: Thunder, Lakers, Spurs.
- Mover slider MIN a 35 o 40.
- Cambiar Over/Under.
- Cambiar Local/Visitante.
- Confirmar que gráfico, resumen y tabla de histórico cambian juntos.
