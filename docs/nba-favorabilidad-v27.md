# MoskProps NBA v2.7 — Ajuste por rival

En la ficha, dentro de **Qué cambia hoy**, aparece una tarjeta para puntos, rebotes y asistencias. Muestra la base reciente del jugador, el valor con el ajuste defensivo y la diferencia. Cada estadística puede tener una lectura distinta.

La tarjeta usa los partidos y defensas que ya publica el archivo NBA. No requiere cuotas, otro scraper, una migración de Supabase ni volver a instalar los temporizadores de v2.6.

## Instalación y prueba

Con el ZIP en `Descargas`, ejecutá:

```bash
(
  set -e
  cd "$HOME/Descargas"
  unzip -o moskprops-nba-v2.7.zip
  cd moskprops-nba-v2.7
  sha256sum -c SHA256SUMS
  paquete_nba="$PWD/nba-favorabilidad-v27.bundle"
  cd "$HOME/stats-app-piloto-v24"
  git merge-base --is-ancestor 483345a HEAD
  git fetch "$paquete_nba" refs/heads/nba-favorabilidad-v27
  git merge --ff-only FETCH_HEAD
  git log -1 --oneline
  npm run lint
  node scripts/verificar-favorabilidad-nba.mjs
)
```

Se requiere la v2.6 (`483345a`), las dependencias de Node y el entorno que ya usa el piloto. Ante un rechazo de `--ff-only`, no hagas reset ni fuerces el avance; conserva las dos ramas para revisar la diferencia.

Si el piloto está abierto con `npm run dev`, recargá la página. Si no, podés levantarlo así:

```bash
cd "$HOME/stats-app-piloto-v24" &&
env -u NODE_OPTIONS AUTH_ORIGIN=http://localhost:3000 \
  npm run dev -- --port 3000 --hostname localhost
```

1. Entrá en [Castle · ficha de jugador](http://localhost:3000/players/1642264?stat=pts).
2. En **Cambiar partido**, elegí un cruce confirmado. En **Qué cambia hoy → Ajuste por rival**, comprobá los tres valores.
3. Cambiá de puntos a rebotes o asistencias. La tabla se conserva y el motivo cambia al mercado elegido. Cambiar L5/L10, la línea o Más/Menos no cambia el ajuste. Al seleccionar un período parcial, la tarjeta de partido completo se oculta.
4. Abrí **Qué sostiene el ajuste** para ver las muestras de jugador, rival y liga, el ajuste aplicado y, cuando existen comparaciones, el error histórico.

## Qué calcula

- **Base del jugador:** promedio de hasta diez partidos anteriores, con el mismo equipo, temporada y fase. Al menos cinco con dato y 70 % de cobertura. Se separa un cambio de equipo y no se completa una muestra corta con partidos de la temporada anterior. Los minutos se muestran como referencia de esa misma muestra.
- **Defensa:** producción que concede el rival por partido frente al promedio de la liga para el grupo de posición del jugador. Si la posición no es clara o no tiene cobertura, se usa la comparación de equipos completos y se indica. Se requieren ocho partidos válidos del rival, al menos 75 % de cobertura sobre sus juegos en el archivo y al menos 24 equipos con cobertura en fase regular (ocho en playoffs).
- **Ajuste:** si el rival permite `d%` más o menos y hay `n` juegos válidos, se aplica `d% × n/(n+12)` al promedio del jugador, con tope de ±15 %. Los 12 partidos son un parámetro fijo para moderar muestras chicas, no una cifra de la NBA. Las diferencias de menos de 0,4 PTS o 0,2 REB/AST se leen como **parejas**. El ranking de defensa puede diferir: sus reglas de cobertura son otras.
- **Evaluación:** para cada partido pasado, el modelo ve solo los datos de fechas anteriores. Se compara el error absoluto medio de la base y el ajuste sobre los mismos juegos. Si hay al menos 20 y el error baja en al menos 2 % y 0,05 unidades, se muestra como estimación. En otro caso, el número con asterisco es un escenario de defensa. Si falta la muestra actual, no se calcula un número ajustado.

Ejemplo aritmético: para una base L10 de 16,2 PTS, un rival que concede 6,1 % más y 14 partidos válidos de defensa, el ajuste bruto es +3,3 % y el escenario queda cerca de **16,7 PTS (+0,5)**. Es una ilustración con las cifras de la captura; el resultado de Castle se verifica con tu archivo.

El cálculo es para **partido completo, si juega**. Si el parte del mismo partido lo confirma fuera, se ocultan los números. El ajuste no agrega por separado ritmo, descanso ni efecto de bajas. Lo que concede el rival por partido ya recoge diferencias de ritmo; sumar otro ajuste sin medirlo podría contar ese efecto dos veces.

Referencias: [Resumen del cruce de LudoProps](https://ludoprops.com/), [estadísticas de rivales en NBA.com](https://www.nba.com/stats/teams/opponent) y [evaluación cronológica de pronósticos](https://otexts.com/fpp3/tscv.html).

## Verificar el cálculo real en tu archivo

En modo local, este comando lee un jugador y hasta dos bloques de defensa. La fecha es la del calendario NBA en el Este; para un partido a las 00:00 AR puede corresponder al día anterior.

```bash
cd "$HOME/stats-app-piloto-v24" &&
node scripts/verificar-favorabilidad-nba.mjs \
  --archivo "$HOME/stats-app/maintenance-state/archive" \
  --player 1642264 --team SAS --rival SAC --position G --date 2026-11-21
```

La salida explica si faltan partidos del jugador o del rival y cuántos juegos se pudieron evaluar. La web valida además que el jugador, el rival y la fecha correspondan al calendario. Si actualizaste el archivo local pero la web todavía muestra una referencia anterior, revisá su publicación habitual del histórico.
