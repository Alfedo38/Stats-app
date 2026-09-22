# NBA Data Pipeline

Objetivo:
Completar y mejorar la base NBA en Supabase usando nba_api.

Regla principal:
No romper las tablas actuales de public.

Estrategia:
1. Crear schema nba_api_data.
2. Crear tablas limpias v2.
3. Bajar primero temporada actual.
4. Comparar contra public.player_game_logs.
5. Completar datos faltantes.
6. Recién después conectar con Ludo.

Temporada inicial:
2025-26

Season types:
- Regular Season
- Playoffs
