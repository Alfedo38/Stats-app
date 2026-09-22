# Carga CSV WNBA a Postgres/Supabase

## 1) Crear carpeta y poner los CSV ahí
cd ~/stats-app
mkdir -p wnba_data

# Copiá estos archivos a ~/stats-app/wnba_data:
# teams.csv
# players.csv
# games.csv
# team_game_stats.csv
# player_game_stats.csv
# player_game_stats_advanced.csv
# player_season_stats.csv
# team_season_stats.csv

## 2) Copiar el script
# Guardá load_wnba_csvs_postgres.py en ~/stats-app

## 3) Instalar dependencias
cd ~/stats-app
source motor_python/.venv/bin/activate  # si tu venv está ahí
pip install -r requirements_wnba_loader.txt

## 4) Verificar sin tocar la DB
python3 load_wnba_csvs_postgres.py --data-dir ./wnba_data --schema wnba_api_data --dry-run

## 5) Cargar a Postgres/Supabase
python3 load_wnba_csvs_postgres.py --data-dir ./wnba_data --schema wnba_api_data --if-exists replace

## 6) Probar en SQL
select count(*) from wnba_api_data.teams;
select count(*) from wnba_api_data.players;
select count(*) from wnba_api_data.games;
select count(*) from wnba_api_data.player_game_stats;
select count(*) from wnba_api_data.player_game_stats_advanced;
select count(*) from wnba_api_data.player_season_stats_base;
select count(*) from wnba_api_data.player_season_stats_advanced;
select count(*) from wnba_api_data.team_game_stats;
select count(*) from wnba_api_data.team_season_stats;
