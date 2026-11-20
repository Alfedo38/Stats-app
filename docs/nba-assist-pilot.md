# NBA: piloto local de asistencias por conexión y zona

El piloto responde dos preguntas: quién asistió a quién y en qué zona se anotó la canasta. Las asistencias potenciales siguen siendo una métrica distinta. Solo se aceptan partidos finalizados cuyo jugada por jugada concilia asistencias y tiros anotados con el boxscore de **cada jugador**, para ambos equipos.

Desde la raíz del proyecto, para los tres partidos más recientes de San Antonio en el archivo local:

```bash
.venv-maintenance/bin/python -m maintenance_nba.assist_pilot --team SAS --games 3 --source nba-api
```

Si el archivo aún no tiene la jornada, se puede identificar un partido finalizado con `--game ID:AAAA-MM-DD`. La fecha es argentina y debe ser anterior a `--before` (por defecto, hoy). Usá `--offline` para leer solamente los JSON locales del piloto o los ya guardados por el piloto de rotaciones. La ejecución en línea usa `nba_api==1.11.6`, versión fijada en `requirements-maintenance.txt`. Descarga desde NBA liveData el boxscore y el jugada por jugada que falten. Límite: seis partidos.

Si liveData no responde, probá `--source stats` con la misma versión de la biblioteca. Usa NBA Stats V3: verifica fecha argentina, estado final y equipos en el resumen; toma las canastas y sus coordenadas del jugada por jugada; identifica al asistidor de la anotación solo si coincide con un jugador único del mismo equipo. También concilia los triples anotados por jugador. La ruta HTTP anterior queda disponible con `--source live` para diagnóstico.

Cada ejecución escribe un informe nuevo en `maintenance-state/assist-pilot/reports/` con motivos de exclusión y hashes de los archivos usados. La ejecución sale con código distinto de cero si excluye algún partido; conserva los conciliados en el informe. No escribe en PostgreSQL ni Supabase, ni publica en la web. Si una jugada no trae zona, queda `sin_zona`; la conexión igualmente cuenta si las asistencias concilian. Aro: menos de cuatro pies. Cuando hay coordenadas, se usan para el cálculo y se evita el redondeo distinto entre ambas fuentes. Los triples se separan en esquina y fuera de la esquina con coordenadas legacy; los demás dobles se agrupan. Esta clasificación operativa es distinta de las zonas oficiales del mapa de tiro.

Fuentes: [corrección liveData de nba_api 1.11.6](https://github.com/swar/nba_api/releases/tag/v1.11.6), [NBA Stats V3: jugada por jugada](https://github.com/swar/nba_api/blob/master/docs/nba_api/stats/endpoints/playbyplayv3.md), [NBA liveData boxscore](https://github.com/swar/nba_api/blob/master/docs/nba_api/live/endpoints/boxscore.md) y [mapeo de identificadores de pbpstats para el jugada por jugada](https://pbpstats.readthedocs.io/en/latest/_modules/pbpstats/resources/enhanced_pbp/live/enhanced_pbp_item.html).

## Vista previa en la ficha

Desde el worktree del piloto, indicá el informe de la corrida `6/6` y la ruta del proyecto donde quedaron los JSON originales. Por ejemplo:

```bash
cd "$HOME/stats-app-piloto-v24" &&
"$HOME/stats-app/.venv-maintenance/bin/python" -m maintenance_nba.assist_snapshot \
  --project "$HOME/stats-app" \
  --report "$HOME/stats-app/maintenance-state/assist-pilot/reports/SAS-20261120-130844-344689.json"
```

El comando valida que los archivos originen los mismos datos del informe y guarda `maintenance-state/assist-pilot/snapshot.json` en el worktree. Contiene nombres, jugadores que entraron y conteos por partido, pareja y zona; no contiene jugadas. Si falta algún JSON o cambió después del informe, se debe regenerar el informe antes de preparar el resumen.

Con las dependencias de Node instaladas en el worktree (`npm ci`), iniciá la app local en el puerto 3001, reutilizando la configuración que ya usa el proyecto principal:

```bash
NBA_ASSIST_LOCAL=1 AUTH_ORIGIN=http://localhost:3001 \
  node --env-file-if-exists="$HOME/stats-app/.env" --env-file-if-exists="$HOME/stats-app/.env.local" \
  node_modules/next/dist/bin/next dev --port 3001
```

Entrá en [la ficha de Stephon Castle](http://localhost:3001/players/1642264?stat=ast), dejá el filtro **Partido completo** y abrí **Conexiones de asistencias** debajo del gráfico. La cobertura cuenta los partidos solicitados en los que se pudo comprobar que jugó. Un cero solo se muestra si hay partidos verificados; una ausencia queda fuera del recuento.

La vista previa lee el archivo local solo en desarrollo y con `NBA_ASSIST_LOCAL=1`. Para una publicación futura, el exportador habitual puede incluir el resumen como una sola parte comprimida del archivo privado si encuentra `maintenance-state/assist-pilot/snapshot.json` en el proyecto de publicación y `NBA_ASSIST_ARCHIVE=1`. Generar el resumen y probarlo en desarrollo no modifica Supabase ni la web publicada.
