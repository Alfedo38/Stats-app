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

**Antes de publicar:** probar tres partidos reales, revisar toda exclusión y algunos pares de jugadores contra el boxscore. Si concilia, ampliar a seis y medir cobertura por zona. Después agregar una sección en la ficha que use solo resúmenes por partido, con cantidad de partidos y zonas sin dato. No subir los JSON crudos a Supabase.
