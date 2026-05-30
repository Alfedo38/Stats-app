# Player Page UI v8

Cambios principales:

1. El gráfico principal queda solo con ventanas L30 / L20 / L10 / L5. Se elimina TODO del selector visual.
2. Los mercados principales quedan limpios:
   - PTS, REB, AST
   - PTS+AST, PTS+REB, REB+AST, P+R+A
   - FGM, FGA, 3PTM, 3PTA
   - BLK, STL, STL+BLK
   - TO, PF
3. USG% y TOUCHES salen del menú principal y quedan como datos de apoyo en Supporting Data / tabla histórica cuando existan.
4. Se agregan filtros globales para histórico FULL:
   - Over / Under
   - MIN >= 20 / 25 / 30 / 35 / 40
   - Local / Visitante
   - VS equipo
5. La tabla histórica queda como tabla única: usa los mismos filtros globales que el gráfico.
6. El overlay punteado de Pot. AST / Chances Reb. ahora muestra número en un círculo sobre cada punto cuando la muestra es legible.
7. El endpoint histórico soporta más mercados: FGM, FGA, 3PTA, BLK, STL, STL+BLK, TO, PF.
8. SQL actualizado para que la vista unificada incluya stl_blk, usage_pct, touches, potential_ast y rebound_chances en filas actuales.

Importante:
- Ejecutar nuevamente `sql/20260528_player_page_unified_history.sql` en Supabase para actualizar la vista unificada.
- El filtro W/O desde Injury Report sigue existiendo como filtro visual/actual; la conexión histórica W/O por compañero requiere una fase aparte con game_id de compañeros en histórico.
