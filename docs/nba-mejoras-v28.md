# MoskProps NBA v2.8

**Ajuste por rival.** La tarjeta destaca la mejor referencia para la estadística elegida. Si la evaluación histórica justificó el ajuste, se muestran el valor ajustado, el promedio base y la diferencia. Si la defensa sugiere otro valor pero el ajuste no quedó validado, el promedio reciente sigue arriba y la diferencia queda como escenario. Se conserva el método de cálculo de v2.7.

**Jornada.** El botón **4/5 + 8/10** exige ambos mínimos a la vez y diez partidos con dato. Evalúa la línea que aparece en la fila para el lado y período elegidos. Al elegir una casa, el jugador necesita una cuota de esa casa para esa misma línea, lado y período. Si querés investigar sin precios, usá **Explorar historial → Todas las casas**.

**Primer cuarto.** En la ficha del jugador, seleccioná **Primer cuarto**. Debajo del gráfico aparece una tarjeta con hasta diez partidos jugados anteriores al encuentro. Muestra los minutos verificados, los promedios de puntos, rebotes y asistencias, y cómo entró cuando hay rotación conciliada. En **Partido por partido**, **0:00** indica que se confirmó que no entró al cuarto. **S/D** indica un dato faltante o que no se pudo verificar. Los promedios de producción solo cuentan partidos en los que jugó el cuarto y se conoce la estadística.

Jornada usa el archivo histórico y consulta los parciales publicados de Supabase. Los minutos de la ficha pueden venir de las rotaciones o de un campo de minutos del período verificado. Una fila de ceros sin evidencia de participación no cuenta como acierto del Under. No se necesitan nuevas tablas, cargas ni temporizadores.

Para probarlo localmente:

1. En [Jornada NBA](http://localhost:3000/trending), activá **4/5 + 8/10**. Cambiá el lado, la línea o el período; los resultados deben reevaluarse. Sin precios para un parcial, usá **Todas las casas** en modo historial.
2. Abrí [la ficha de Castle en primer cuarto](http://localhost:3000/players/1642264?stat=pts&scope=Q1). Abrí **Partido por partido** y revisá la cobertura que acompaña a cada promedio.
3. Volvé a **Partido completo** y elegí un cruce. En **Ajuste por rival**, fijate si el valor principal es **Promedio reciente** o **Estimación ajustada**.
