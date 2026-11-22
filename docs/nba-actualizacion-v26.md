# MoskProps NBA v2.6

Una sola actualización para la ficha NBA, Jornada, Tickets y la publicación de datos. La base de Git es `f80686b`, la v2.5 que publicaste en `main`.

| Pantalla | Qué cambia |
| --- | --- |
| Ficha del jugador | Una vista avanzada más compacta, con gráfico, línea, cuotas, L5/L10 de la temporada actual y un selector para navegar el plantel. Cambiar Más/Menos o la línea conserva los partidos en pantalla. Se puede elegir la temporada anterior o filtrar contra el próximo rival. En rebotes se separan ofensivos y defensivos cuando existen ambos datos. |
| Jornada NBA | Acceso rápido a mercados, mini gráfico L10, partidos consecutivos y comparación de cuotas. La vista distingue entre una fuente que no responde, un mercado sin filas y filas que no coinciden con la selección. |
| Ficha, Jornada y Analizador | Comparten reglas de cuota por jugador, partido, fecha argentina, período, lado, línea y vigencia. Una selección 8+ equivale a Más de 7,5; Más de 8 conserva su liquidación distinta. Las cuotas se ven sin hora de captura. |
| Tickets | El campo de fecha sigue la jornada al cambiar de día. Los datos ausentes se distinguen de un resultado que coincide con una línea entera. |
| Previa y parte | `Qué cambia hoy` concentra descanso, próximo rival, parte y efecto de bajas confirmadas. Un equipo pendiente nunca aparece como un equipo sin bajas. Los quintetos de la previa son los últimos titulares verificados, con la fecha del partido jugado. |
| Rotaciones y contexto | Minutos con y sin un compañero, tamaños de muestra y cuartos con datos verificados. Solo se muestra una estimación de minutos si mejora la referencia al probarla en partidos posteriores. El panel identifica reemplazos únicos y cuenta por separado los cambios múltiples. |
| Tiros, marcas y tipos de jugada | Plan de las últimas cuatro temporadas por jugador y rival. Los tiros nuevos deben conciliar con FGA y FGM. El perfil por jugada compara volumen y eficiencia del jugador con lo que concede el rival. La captura de una previa no puede ser posterior al salto inicial. |

## 1. Pasar el paquete al piloto

Desde Linux Mint, con el ZIP en `Descargas`:

```bash
cd "$HOME/Descargas" &&
unzip -o moskprops-nba-v2.6.zip &&
cd moskprops-nba-v2.6 &&
sha256sum -c SHA256SUMS &&
git -C "$HOME/stats-app-piloto-v24" fetch \
  "$PWD/nba-actualizacion-v26.bundle" refs/heads/nba-actualizacion-v26 &&
git -C "$HOME/stats-app-piloto-v24" merge --ff-only FETCH_HEAD
```

El avance rápido conserva las carpetas locales del piloto. Si Git dice que no puede avanzar, no hagas reset, no fuerces el merge y no uses la copia principal con cambios. En el piloto podés revisar `npm run lint`, `node scripts/verificar-nba-v26.mjs` y `npm run build`. El servidor de la ficha sigue siendo `localhost:3000`; usá un solo servidor Next en ese puerto. Se necesitan las dependencias y el entorno que ya tenía el piloto.

## 2. Activar los datos desde la PC que captura

```bash
"$HOME/stats-app/.venv-maintenance/bin/python" \
  "$HOME/stats-app-piloto-v24/scripts/operar-nba-v26.py" --plan &&
"$HOME/stats-app/.venv-maintenance/bin/python" \
  "$HOME/stats-app-piloto-v24/scripts/operar-nba-v26.py" --apply
```

El plan no escribe. Aplicar crea la tabla de la última edición del parte en la base configurada, hace un respaldo del exportador antes de agregar su extensión e instala temporizadores de usuario en horario argentino. El parte consulta cada 15 minutos desde el mediodía hasta las 03:00. Cuotas se publica aparte del archivo de estadísticas. El perfil se captura una vez al día para el siguiente envío del archivo. Se conservan el proceso de estadísticas existente y sus bloques de asistencias y rotaciones. Mantené el piloto en esa ruta mientras los servicios lo usen.

Si el publicador local no coincide con la versión revisada, usá `--sin-cuotas` en **ambos** comandos para instalar el parte y el perfil sin tocar ese publicador. El estado se verifica con:

```bash
systemctl --user list-timers --all --no-pager 'nba-maint-*-v26.timer'
journalctl --user -u nba-maint-injury-editions-v26.service -n 20 --no-pager -o cat
"$HOME/stats-app/.venv-maintenance/bin/python" \
  "$HOME/stats-app-piloto-v24/scripts/verificar-publicacion-cuotas.py" \
  --project "$HOME/stats-app"
```

Si hay una casa con capturas en PostgreSQL local y cero filas en la caché, y el publicador seguro quedó instalado:

```bash
"$HOME/scraperodds/nba-cuotas/.venv/bin/python" \
  "$HOME/stats-app-piloto-v24/scripts/operar-nba-v26.py" --repair-odds
```

La reparación verifica las tres etapas de la cadena y vuelve a contar tras el envío. Si la captura local está vacía, no retira cuotas de Supabase. Un cero en origen y caché se resuelve en la publicación; un cero en la captura se resuelve en el scraper/configuración local. El paquete no sustituye el scraper.

## 3. Cargar la muestra histórica y el perfil

Ejemplo con Castle contra NOP. `--before` excluye ese día y permite reproducir la previa. Para Dončić–ATL, usá `--player 1629029 --opponent ATL --before 2026-11-09`.

```bash
cd "$HOME/stats-app-piloto-v24" &&
"$HOME/stats-app/.venv-maintenance/bin/python" -m maintenance_nba.qa_context_v26 \
  plan --project "$HOME/stats-app" --player 1642264 --opponent NOP --before 2026-11-21 &&
"$HOME/stats-app/.venv-maintenance/bin/python" -m maintenance_nba.qa_context_v26 \
  collect --project "$HOME/stats-app" --player 1642264 --opponent NOP --before 2026-11-21 --limit 16
```

La descarga guarda lotes locales conciliados. Si la fuente devuelve un bloqueo o faltan box scores, esos juegos siguen pendientes; el comando conserva lo descargado y se puede retomar. Para preparar el perfil vigente y después incorporar al archivo los tiros, marcas y perfiles disponibles:

```bash
systemctl --user start nba-maint-playtypes-v26.service
systemctl --user start --no-block nba-maint-archive-only.service
```

El último quinteto se toma de rotaciones verificadas y no pronostica titulares. Las marcas defensivas no identifican quién defendió cada tiro individual. Los triples tras bote o recepción necesitan tracking por juego que todavía no está incorporado. La descarga no promete cobertura completa hasta comprobar qué partidos devuelve la fuente.

## 4. Producción

Una vez revisado el piloto, para que el código llegue a la URL principal de Vercel se avanza `main`, sin `--force`. El Git bundle por sí solo no cambia producción. Podés verificar el commit de producción en Vercel y luego revisar las selecciones en Jornada, ficha y analizador. La publicación de datos sigue estando a cargo de tu PC y no se reemplaza al subir Git.

```bash
git -C "$HOME/stats-app-piloto-v24" push origin HEAD:refs/heads/main
```
