# Player Page Filters + Active Injury Context v19

Cambios principales:

- Corrige `/api/active-injury-context` para evitar `Do not know how to serialize a BigInt`.
- Normaliza `player_id`, fechas y números en `getPlayerActiveInjuryContext`.
- Limpia el panel derecho de filtros:
  - Resumen compacto de muestra, partidos e hit rate.
  - Lado: Over / Under.
  - Cancha: Todos / Local / Visit.
  - Minutos: slider + accesos rápidos.
  - Rival: buscador compacto con sugerencias solo cuando escribís.
  - Bajas activas: contexto compacto dentro del panel de filtros.
- Mueve el contexto de bajas activas desde debajo del gráfico al panel lateral.
- Incluye TeamMatesPanel v16 y DvpPanel v17 para mantener las mejoras recientes.

Nota:

El bloque "Bajas activas" es contexto informativo. El filtro W/O real queda preparado para una fase siguiente cuando exista una vista a nivel partido con game_id por compañero ausente.

Instalación:

```bash
cd ~/Descargas
unzip player-page-filters-active-injury-v19.zip -d player-page-filters-active-injury-v19
cp -r player-page-filters-active-injury-v19/* ~/stats-app/
cd ~/stats-app
rm -rf .next
npm run dev
```
