# Injuries Game Scoped v20

Corrige `/injuries` para que no muestre todo el historial de lesiones.

## Cambios
- Filtra `public.v_nba_injuries_latest` por `game_date` de hoy y mañana.
- Deduplica jugador/equipo/status para evitar listas enormes repetidas.
- Excluye `AVAILABLE`, `ACTIVE` y `UNKNOWN`.
- Convierte IDs BigInt a string en la UI.
- Agrega navegación de día anterior/día siguiente con `?date=YYYY-MM-DD`.

## Instalar

```bash
cd ~/Descargas
unzip injuries-game-scoped-v20.zip -d injuries-game-scoped-v20
cp -r injuries-game-scoped-v20/* ~/stats-app/
cd ~/stats-app
rm -rf .next
npm run dev
```

## Probar
- `/injuries`
- `/injuries?date=2026-05-30`
