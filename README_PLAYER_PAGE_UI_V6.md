# Player Page UI v6 — gráfico unificado + L30 + bio mejorada

## Qué cambia

1. **Gráfico unificado**
   - El gráfico principal ahora puede mostrar:
     - `Actual L5/L10/L20/L30`
     - `Hist. 2 temp.`
     - `Hist. completo`
   - Ya no se duplica el gráfico histórico abajo. El histórico queda como resumen + tabla.

2. **L30 agregado**
   - Se agregó `L30` en los botones del gráfico actual.
   - El backend histórico ahora devuelve `recent.l30`.
   - El explorador histórico muestra L5/L10/L20/L30.

3. **Filtros históricos arriba del gráfico**
   - En modo histórico podés filtrar:
     - Over / Under
     - Todos MIN / MIN ≥ 20 / 25 / 30 / 35 / 40
     - Rival, por ejemplo OKC/SAS/DEN
   - Si buscás rival, automáticamente conviene usar `Hist. completo`.

4. **Colores del gráfico según hit/miss**
   - Verde = hit según side seleccionada.
   - Rojo = miss.
   - Amarillo = push.
   - Para Under, verde significa que el valor quedó debajo de la línea.

5. **Header/bio más robusto**
   - `lib/playerBio.ts` ahora busca en `nba_historical.players` por:
     - nombre exacto
     - tokens de nombre/apellido
     - player_id como último fallback
   - También intenta local por nombre si no encontró local por id.

## Instalación

```bash
cd ~/Descargas
unzip player-page-ui-upgrade-v6-patch.zip -d player-page-ui-upgrade-v6-patch
cp -r player-page-ui-upgrade-v6-patch/* ~/stats-app/

cd ~/stats-app
rm -rf .next
npm run dev
```

## SQL recomendado

Si todavía no corriste el SQL de v5, corré:

```txt
sql/20260528_player_page_unified_history.sql
```

Ese SQL crea:

```sql
nba_api_data.v_ludo_player_page_history_unified
```

Es la vista que une histórico profundo + temporada actual para que el modo histórico llegue hasta los partidos recientes.

## Qué probar

1. Abrir un jugador.
2. Probar `Actual L30`.
3. Cambiar a `Hist. 2 temp.`.
4. Cambiar a `Hist. completo`.
5. En histórico probar `MIN ≥ 40`.
6. Buscar `VS OKC`.
7. Probar Over y Under.
8. Verificar que abajo el explorador muestre L5/L10/L20/L30 y tabla, pero no otro gráfico duplicado.

