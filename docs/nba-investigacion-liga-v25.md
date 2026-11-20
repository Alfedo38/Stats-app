# NBA v2.5 · Investigación de liga

Versión preparada sobre el piloto de conexiones `db4e523`. El paquete se aplica en el worktree del piloto, antes de mover cambios a la app principal. Mantiene el resumen de SAS v1 como respaldo.

## Qué cambia

- **Ficha:** muestra L10 de cada temporada, temporada actual y últimos cinco cruces contra el próximo rival (aunque no entren en el L10). Conserva L5/L10 por temporada en el detalle. Cuando se cambia la línea o el lado se recalculan los resultados.
- **Asistencias:** liga completa por ID de partido; dos listas con retrato, % del total y promedio en partidos que jugaron juntos. Muestra la distribución por zona, la cantidad concedida por el rival y, con cobertura suficiente de los 30 equipos, la referencia de liga. Las asistencias potenciales siguen en gris, aparte de las oficiales.
- **Bajas:** minutos, puntos, rebotes, asistencias, FGA y FGM con y sin un compañero. Para bajas simultáneas se cruzan los partidos donde faltaron todos. Cada diferencia requiere al menos cinco resultados utilizables por grupo. Desde la ficha, el botón abre esos partidos en el gráfico.
- **Minutos:** rango central histórico y mediana reciente. La estimación `0,65 × mediana L5 + 0,35 × mediana L10` solo aparece si mejora al menos 0,1 min sobre la mediana L10 en 20 o más partidos previos, usando para cada prueba solo partidos anteriores. Ante una baja o un parte sin verificar, quedan las referencias históricas.
- **Rotaciones:** patrón por cuarto, titularidades, cierres del primer cuarto y tramos por partido. Datos del boxscore y play-by-play; una rotación inválida no invalida sus asistencias.
- **Cuotas:** Desde **Jornada → Diferencias de cuota**, compara la misma línea y condición entre 365, Bto y Ste. La diferencia es sobre la cuota decimal; no expresa una probabilidad. No se incluyen marcas de hora visibles. FGM pasa a la Jornada; los dobles 2PA/2PM se conservan dentro de la ficha.
- **Perfil ofensivo:** pick and roll, uno contra uno, transición, tiro al recibir y continuación de bloqueo. Puntos por juego del jugador y puntos por posesión de ambos lados. Requiere datos oficiales NBA Stats/Synergy. Nunca usa una captura del día del partido o posterior para una previa antigua.
- **Analizador:** además de la frecuencia de ambas líneas juntas, muestra el acierto de la segunda cuando la primera cumplió, cuando no cumplió y en todos los cruces decididos.

## Primera tanda local

Desde el worktree actualizado, con la app normal en `$HOME/stats-app`:

```bash
cd "$HOME/stats-app-piloto-v24" &&
"$HOME/stats-app/.venv-maintenance/bin/python" -m maintenance_nba.assist_league \
  --project "$HOME/stats-app" --plan
```

`--plan` no escribe ni contacta a la NBA. Enumera por defecto las últimas dos semanas completas del archivo local (fecha oficial de jornada NBA, que puede diferir de la argentina a medianoche).

```bash
"$HOME/stats-app/.venv-maintenance/bin/python" -m maintenance_nba.assist_league \
  --project "$HOME/stats-app" --collect --rotations
```

Guarda cada partido conciliado, y reanudar el mismo comando no vuelve a consultar los que ya se guardaron. Consulta las fuentes en serie, con pausas, y se detiene ante un rechazo por límite de solicitudes. `--offline` prueba solo los JSON que ya estén guardados. Si liveData no funciona en tu entorno, `--collect --source stats` permite conciliar las asistencias con Stats V3; las rotaciones de liga requieren liveData en esta versión. Agregá `--from AAAA-MM-DD --through AAAA-MM-DD --max-games 120` para avanzar por tramos de la temporada. Revisá el informe al final de cada tanda.

El archivo histórico del proyecto principal enumera los partidos. El piloto recibe el resultado en `maintenance-state/assist-league/` y conserva el resumen anterior si aún faltan partidos. Los datos no se publican al ejecutar este comando.

## Perfil por jugada y defensa individual

El perfil por jugada se descarga aparte. Si la fuente no responde, se conserva cualquier captura anterior y la ficha muestra ausencia de datos:

```bash
"$HOME/stats-app/.venv-maintenance/bin/python" -m maintenance_nba.playtypes_snapshot \
  --season 2026-27
```

Esto es diferente del historial de marcas del defensor. Para diagnosticar cuatro temporadas de asignaciones y el caso Dončić–ATL, usá primero:

```bash
"$HOME/stats-app/.venv-maintenance/bin/python" -m maintenance_nba.matchup_history plan \
  --project "$HOME/stats-app" --player 1629029 --opponent ATL \
  --season 2026-27 --season 2025-26 --season 2024-25 --season 2023-24
```

Solo planifica desde el índice de partidos disponible. Para partidos que falten en ese índice se necesita completar primero el calendario finalizado. Los tiros y las asistencias no prueban qué defensor marcó a quién.

## Arrancar y verificar

Frená cualquier dev server que esté en el puerto 3000 con Ctrl+C y ejecutá desde el piloto (que ya conserva sus enlaces de configuración):

```bash
env -u NODE_OPTIONS NBA_ASSIST_LOCAL=1 NBA_ROTATIONS_LOCAL=1 \
  AUTH_ORIGIN=http://localhost:3000 npm run dev -- --port 3000 --hostname localhost
```

- En la [ficha de Stephon Castle](http://localhost:3000/players/1642264?stat=ast), abrí **Conexiones de asistencias** en partido completo.
- En [Jornada](http://localhost:3000/trending), abrí **Diferencias de cuota** y cambiá de mercado, partido y lado.
- En una ficha con baja confirmada, compará el indicador con y sin el compañero y usá **Ver partidos en el gráfico**.
- Normalmente, **Perfil por tipo de jugada** aparecerá para un partido posterior al día de captura.

```bash
python3 -m unittest discover -s tests_tracking -p 'test_assist*.py' &&
node scripts/verificar-asistencias-conexiones.mjs &&
npm run lint &&
npm run build
```

## Publicación posterior

El exportador habitual admite los bloques por ID de partido y una referencia pequeña por equipo en el bucket privado. Para incorporarlos en el archivo de producción, generá el resultado en el proyecto que publica (opción `--output-project`) y usá `NBA_ASSIST_ARCHIVE=1` en su configuración habitual. Para perfiles, `NBA_PLAYTYPES_ARCHIVE=1`. Usá el mantenimiento ya instalado en el proyecto principal: el worktree de vista previa no necesita la configuración ni los módulos locales del exportador. Antes de habilitar la publicación, revisá cobertura y el margen de Storage. No requiere crear tablas ni mover las bases de cuotas. No ejecuta operaciones sobre Supabase ni Vercel durante la prueba local.
