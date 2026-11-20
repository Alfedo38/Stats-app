# NBA: piloto local de asistencias por conexión y zona

El piloto responde dos preguntas: quién asistió a quién y en qué zona se anotó la canasta. Las asistencias potenciales siguen siendo una métrica distinta. Solo se aceptan partidos finalizados cuyo jugada por jugada concilia asistencias y tiros anotados con el boxscore de **cada jugador**, para ambos equipos.

Desde la raíz del proyecto, para los tres partidos más recientes de San Antonio en el archivo local:

```bash
python3 -m maintenance_nba.assist_pilot --team SAS --games 3
```

Si el archivo aún no tiene la jornada, se puede identificar un partido finalizado con `--game ID:AAAA-MM-DD`. La fecha es argentina y debe ser anterior a `--before` (por defecto, hoy). Usá `--offline` para leer solamente los JSON locales del piloto o los ya guardados por el piloto de rotaciones. La ejecución en línea descarga el boxscore y el jugada por jugada que falten desde NBA liveData. Límite: seis partidos. No requiere paquetes de Python nuevos.

Cada ejecución escribe un informe nuevo en `maintenance-state/assist-pilot/reports/` con motivos de exclusión y hashes de los archivos usados. La ejecución sale con código distinto de cero si excluye algún partido; conserva los conciliados en el informe. No escribe en PostgreSQL ni Supabase, ni publica en la web. Si una jugada no trae zona, queda `sin_zona`; la conexión igualmente cuenta si las asistencias concilian. Aro: menos de cuatro pies. Los triples se separan en esquina y fuera de la esquina con coordenadas legacy; los demás dobles se agrupan. Esta clasificación operativa es distinta de las zonas oficiales del mapa de tiro.

Fuentes: [NBA liveData boxscore](https://github.com/swar/nba_api/blob/master/docs/nba_api/live/endpoints/boxscore.md) y [mapeo de identificadores de pbpstats para el jugada por jugada](https://pbpstats.readthedocs.io/en/latest/_modules/pbpstats/resources/enhanced_pbp/live/enhanced_pbp_item.html).

**Antes de publicar:** probar tres partidos reales, revisar toda exclusión y algunos pares de jugadores contra el boxscore. Si concilia, ampliar a seis y medir cobertura por zona. Después agregar una sección en la ficha que use solo resúmenes por partido, con cantidad de partidos y zonas sin dato. No subir los JSON crudos a Supabase.
