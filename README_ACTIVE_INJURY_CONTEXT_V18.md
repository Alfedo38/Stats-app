# Player Page v18 — Contexto por bajas activas

Este patch agrega una card informativa que usa:

```sql
public.v_ludo_active_injury_context
```

para mostrar cómo rindió el jugador históricamente cuando faltaron compañeros actualmente reportados como bajas activas.

## Archivos incluidos

```txt
components/ActiveInjuryContextCard.tsx
components/PlayerPageContent.tsx
app/players/[playerId]/page.tsx
app/api/active-injury-context/route.ts
lib/api.ts
```

## Qué hace

- Agrega `getPlayerActiveInjuryContext(playerId, gameDate)` en `lib/api.ts`.
- Consulta `public.v_ludo_active_injury_context` por `player_id` y `game_date`.
- Ordena por `absent_importance_score`, `games`, `avg_pra`.
- Muestra una card: `Contexto por bajas activas`.
- Prioriza HIGH / MEDIUM / STAR / STARTER.
- Limita la vista principal a 2 contextos y permite expandir.

## Endpoint de prueba

Después de instalar:

```txt
/api/active-injury-context?playerId=1628983&gameDate=2026-05-30
```

Debe devolver JSON con las filas de la vista.

## Instalación

```bash
cd ~/Descargas
unzip player-page-active-injury-context-v18.zip -d player-page-active-injury-context-v18
cp -r player-page-active-injury-context-v18/* ~/stats-app/

cd ~/stats-app
rm -rf .next
npm run dev
```

## Validación SQL

```sql
SELECT *
FROM public.v_ludo_active_injury_context
WHERE game_date = '2026-05-30'
  AND player_id = 1628983
ORDER BY absent_importance_score DESC, games DESC;
```

## Nota

Este patch **no convierte todavía las bajas en filtros interactivos W/O**. Primero las muestra como contexto informativo seguro. El filtro clickeable se puede hacer después cuando terminemos de cerrar la normalización por partido.
