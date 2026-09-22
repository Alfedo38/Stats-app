
╔══════════════════════════════════════════════════════════════════════════════╗
║                    WNBA DATABASE — ESQUEMA DE TABLAS                        ║
║                    Generado: 2026-05-24 09:57:35                          ║
╚══════════════════════════════════════════════════════════════════════════════╝

Este archivo explica qué tablas crear en tu base de datos para importar
los CSVs generados por wnba_csv_exporter.py

Los scripts SQL están al final de cada sección.
Compatibles con: PostgreSQL · MySQL / MariaDB · SQLite

════════════════════════════════════════════════════════════════════════════════
RELACIONES ENTRE TABLAS
════════════════════════════════════════════════════════════════════════════════

  teams ──────────────────────────────────────────────────────────┐
    │                                                             │
    ├── players (team_id → teams.team_id)                         │
    │                                                             │
    ├── games   (home_team_id, away_team_id → teams.team_id)      │
    │              │                                              │
    │              ├── player_game_stats        (game_id)         │
    │              ├── player_game_stats_advanced(game_id)        │
    │              └── team_game_stats           (game_id)        │
    │                                                             │
    ├── player_season_stats (player_id, team_id)                  │
    └── team_season_stats   (team_id) ────────────────────────────┘


════════════════════════════════════════════════════════════════════════════════
1. TABLA: teams
   Archivo CSV: teams.csv
   Descripción: Un registro por equipo WNBA.
════════════════════════════════════════════════════════════════════════════════

Columnas detectadas en el CSV:
    · team_id
  · team_abbr
  · team_name
  · updated_at

── SQL (PostgreSQL / MySQL) ──────────────────────────────────────────────────
CREATE TABLE teams (
    team_id        INT           PRIMARY KEY,   -- ID único del equipo
    team_abbr      VARCHAR(10),                 -- Abreviatura  ej: "IND"
    team_name      VARCHAR(100),                -- Nombre       ej: "Indiana Fever"
    team_city      VARCHAR(100),                -- Ciudad
    arena          VARCHAR(150),                -- Nombre del estadio
    head_coach     VARCHAR(100),                -- Entrenadora/or principal
    updated_at     TIMESTAMP                    -- Fecha de última actualización
);

── SQL (SQLite) ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS teams (
    team_id     INTEGER PRIMARY KEY,
    team_abbr   TEXT,
    team_name   TEXT,
    team_city   TEXT,
    arena       TEXT,
    head_coach  TEXT,
    updated_at  TEXT
);

── Importar CSV (PostgreSQL) ─────────────────────────────────────────────────
\COPY teams FROM 'teams.csv' WITH (FORMAT CSV, HEADER TRUE, ENCODING 'UTF8');

── Importar CSV (MySQL) ──────────────────────────────────────────────────────
LOAD DATA INFILE '/ruta/teams.csv'
INTO TABLE teams
FIELDS TERMINATED BY ','
ENCLOSED BY '"'
LINES TERMINATED BY '\n'
IGNORE 1 ROWS;


════════════════════════════════════════════════════════════════════════════════
2. TABLA: players
   Archivo CSV: players.csv
   Descripción: Una fila por jugadora. Incluye datos de draft, posición, país.
════════════════════════════════════════════════════════════════════════════════

Columnas detectadas:
    · player_id
  · first_name
  · last_name
  · full_name
  · is_active
  · team_id
  · team_abbr
  · jersey
  · position
  · height
  · weight
  · birth_date
  · experience
  · school
  · country
  · draft_year
  · draft_round
  · draft_number
  · updated_at

── SQL ───────────────────────────────────────────────────────────────────────
CREATE TABLE players (
    player_id    INT           PRIMARY KEY,
    first_name   VARCHAR(100),
    last_name    VARCHAR(100),
    full_name    VARCHAR(200),
    is_active    SMALLINT,                -- 1 = activa, 0 = inactiva
    team_id      INT           REFERENCES teams(team_id),
    team_abbr    VARCHAR(10),
    jersey       VARCHAR(10),
    position     VARCHAR(20),             -- G, F, C, F-G, F-C, etc.
    height       VARCHAR(20),             -- ej: "6-1"
    weight       VARCHAR(20),
    birth_date   DATE,
    experience   INT,                     -- años en la liga
    school       VARCHAR(200),
    country      VARCHAR(100),
    draft_year   INT,
    draft_round  INT,
    draft_number INT,
    updated_at   TIMESTAMP
);

── Importar CSV (PostgreSQL) ─────────────────────────────────────────────────
\COPY players FROM 'players.csv' WITH (FORMAT CSV, HEADER TRUE, ENCODING 'UTF8');


════════════════════════════════════════════════════════════════════════════════
3. TABLA: games
   Archivo CSV: games.csv
   Descripción: Un registro por partido. Score final, fecha, equipos.
════════════════════════════════════════════════════════════════════════════════

Columnas detectadas:
    · game_id
  · season
  · season_type
  · game_date
  · updated_at
  · away_team_id
  · away_team_abbr
  · away_pts
  · away_wl
  · home_team_id
  · home_team_abbr
  · home_pts
  · home_wl

── SQL ───────────────────────────────────────────────────────────────────────
CREATE TABLE games (
    game_id        VARCHAR(20)   PRIMARY KEY,   -- ID único del partido
    season         VARCHAR(10),                 -- ej: "2024"
    season_type    VARCHAR(30),                 -- "Regular Season" o "Playoffs"
    game_date      DATE,
    home_team_id   INT           REFERENCES teams(team_id),
    away_team_id   INT           REFERENCES teams(team_id),
    home_team_abbr VARCHAR(10),
    away_team_abbr VARCHAR(10),
    home_pts       INT,
    away_pts       INT,
    home_wl        CHAR(1),                     -- "W" o "L"
    away_wl        CHAR(1),
    updated_at     TIMESTAMP
);

CREATE INDEX idx_games_season      ON games(season);
CREATE INDEX idx_games_date        ON games(game_date);
CREATE INDEX idx_games_home_team   ON games(home_team_id);
CREATE INDEX idx_games_away_team   ON games(away_team_id);


════════════════════════════════════════════════════════════════════════════════
4. TABLA: player_game_stats
   Archivo CSV: player_game_stats.csv
   Descripción: Box score tradicional. Una fila por jugadora por partido.
                Incluye puntos, rebotes, asistencias, tiros, +/-.
════════════════════════════════════════════════════════════════════════════════

Columnas detectadas:
    · game_id
  · player_id
  · player_name
  · team_id
  · team_abbreviation
  · season
  · season_type
  · start_position
  · comment
  · minutes
  · fgm
  · fga
  · fg_pct
  · fg3m
  · fg3a
  · fg3_pct
  · ftm
  · fta
  · ft_pct
  · oreb
  · dreb
  · reb
  · ast
  · stl
  · blk
  · turnovers
  · pf
  · pts
  · plus_minus
  · updated_at

── SQL ───────────────────────────────────────────────────────────────────────
CREATE TABLE player_game_stats (
    id             BIGSERIAL     PRIMARY KEY,   -- auto-incremental
    game_id        VARCHAR(20)   REFERENCES games(game_id),
    player_id      INT           REFERENCES players(player_id),
    player_name    VARCHAR(200),
    team_id        INT           REFERENCES teams(team_id),
    team_abbreviation VARCHAR(10),
    season         VARCHAR(10),
    season_type    VARCHAR(30),
    start_position VARCHAR(5),                  -- titular o suplente
    comment        VARCHAR(200),                -- ej: "DND" (did not dress)
    minutes        VARCHAR(10),
    -- Tiros de campo
    fgm            SMALLINT,                    -- Field Goals Made
    fga            SMALLINT,                    -- Field Goals Attempted
    fg_pct         DECIMAL(5,3),
    -- Triples
    fg3m           SMALLINT,
    fg3a           SMALLINT,
    fg3_pct        DECIMAL(5,3),
    -- Tiros libres
    ftm            SMALLINT,
    fta            SMALLINT,
    ft_pct         DECIMAL(5,3),
    -- Rebotes
    oreb           SMALLINT,                    -- Ofensivos
    dreb           SMALLINT,                    -- Defensivos
    reb            SMALLINT,                    -- Totales
    -- Juego general
    ast            SMALLINT,                    -- Asistencias
    stl            SMALLINT,                    -- Robos
    blk            SMALLINT,                    -- Tapas/Bloqueos
    turnovers      SMALLINT,                    -- Pérdidas
    pf             SMALLINT,                    -- Faltas personales
    pts            SMALLINT,                    -- Puntos
    plus_minus     DECIMAL(6,1),
    updated_at     TIMESTAMP,
    UNIQUE (game_id, player_id)
);

CREATE INDEX idx_pgs_player ON player_game_stats(player_id);
CREATE INDEX idx_pgs_game   ON player_game_stats(game_id);
CREATE INDEX idx_pgs_team   ON player_game_stats(team_id);
CREATE INDEX idx_pgs_season ON player_game_stats(season);


════════════════════════════════════════════════════════════════════════════════
5. TABLA: player_game_stats_advanced
   Archivo CSV: player_game_stats_advanced.csv
   Descripción: Stats avanzadas por partido. Eficiencia, ritmo, porcentajes
                de uso, ratings ofensivos/defensivos, PIE, etc.
════════════════════════════════════════════════════════════════════════════════

Columnas detectadas:
    · game_id
  · player_id
  · player_name
  · team_id
  · season
  · season_type
  · minutes
  · e_fg_pct
  · ts_pct
  · usg_pct
  · off_rating
  · def_rating
  · net_rating
  · ast_pct
  · ast_to
  · ast_ratio
  · oreb_pct
  · dreb_pct
  · reb_pct
  · pace
  · pie
  · updated_at

── SQL ───────────────────────────────────────────────────────────────────────
CREATE TABLE player_game_stats_advanced (
    id           BIGSERIAL   PRIMARY KEY,
    game_id      VARCHAR(20) REFERENCES games(game_id),
    player_id    INT         REFERENCES players(player_id),
    player_name  VARCHAR(200),
    team_id      INT         REFERENCES teams(team_id),
    season       VARCHAR(10),
    season_type  VARCHAR(30),
    minutes      VARCHAR(10),
    -- Eficiencia de tiro
    e_fg_pct     DECIMAL(5,3),   -- Effective FG% (pondera los triples)
    ts_pct       DECIMAL(5,3),   -- True Shooting % (incluye tiros libres)
    usg_pct      DECIMAL(5,3),   -- Usage % (% de posesiones que usa)
    -- Ratings
    off_rating   DECIMAL(7,2),   -- Puntos generados cada 100 posesiones
    def_rating   DECIMAL(7,2),   -- Puntos recibidos cada 100 posesiones
    net_rating   DECIMAL(7,2),   -- Diferencia off - def
    -- Asistencias
    ast_pct      DECIMAL(5,3),   -- % de canastas asistidas
    ast_to       DECIMAL(5,2),   -- Ratio asistencias/pérdidas
    ast_ratio    DECIMAL(5,2),
    -- Rebotes (porcentajes)
    oreb_pct     DECIMAL(5,3),
    dreb_pct     DECIMAL(5,3),
    reb_pct      DECIMAL(5,3),
    -- Otros
    pace         DECIMAL(6,2),   -- Posesiones por 40 minutos
    pie          DECIMAL(5,3),   -- Player Impact Estimate
    updated_at   TIMESTAMP,
    UNIQUE (game_id, player_id)
);

CREATE INDEX idx_pgsa_player ON player_game_stats_advanced(player_id);
CREATE INDEX idx_pgsa_game   ON player_game_stats_advanced(game_id);


════════════════════════════════════════════════════════════════════════════════
6. TABLA: team_game_stats
   Archivo CSV: team_game_stats.csv
   Descripción: Box score de equipo por partido. Totales de cada categoría.
════════════════════════════════════════════════════════════════════════════════

Columnas detectadas:
    · game_id
  · team_id
  · team_abbreviation
  · team_name
  · season
  · season_type
  · wl
  · minutes
  · fgm
  · fga
  · fg_pct
  · fg3m
  · fg3a
  · fg3_pct
  · ftm
  · fta
  · ft_pct
  · oreb
  · dreb
  · reb
  · ast
  · stl
  · blk
  · turnovers
  · pf
  · pts
  · plus_minus
  · updated_at

── SQL ───────────────────────────────────────────────────────────────────────
CREATE TABLE team_game_stats (
    id            BIGSERIAL   PRIMARY KEY,
    game_id       VARCHAR(20) REFERENCES games(game_id),
    team_id       INT         REFERENCES teams(team_id),
    team_abbreviation VARCHAR(10),
    team_name     VARCHAR(100),
    season        VARCHAR(10),
    season_type   VARCHAR(30),
    wl            CHAR(1),
    minutes       VARCHAR(10),
    fgm           SMALLINT,  fga  SMALLINT, fg_pct  DECIMAL(5,3),
    fg3m          SMALLINT,  fg3a SMALLINT, fg3_pct DECIMAL(5,3),
    ftm           SMALLINT,  fta  SMALLINT, ft_pct  DECIMAL(5,3),
    oreb          SMALLINT,  dreb SMALLINT, reb     SMALLINT,
    ast           SMALLINT,  stl  SMALLINT, blk     SMALLINT,
    turnovers     SMALLINT,  pf   SMALLINT, pts     SMALLINT,
    plus_minus    DECIMAL(6,1),
    updated_at    TIMESTAMP,
    UNIQUE (game_id, team_id)
);

CREATE INDEX idx_tgs_team   ON team_game_stats(team_id);
CREATE INDEX idx_tgs_game   ON team_game_stats(game_id);
CREATE INDEX idx_tgs_season ON team_game_stats(season);


════════════════════════════════════════════════════════════════════════════════
7. TABLA: player_season_stats
   Archivo CSV: player_season_stats.csv
   Descripción: Promedios por temporada de cada jugadora.
                Incluye tanto stats base (pts, reb, ast) como avanzadas
                (ts_pct, usg_pct, net_rating, etc.).
                La columna "measure" indica si es "Base" o "Advanced".
════════════════════════════════════════════════════════════════════════════════

Columnas detectadas:
    · player_id
  · player_name
  · nickname
  · team_id
  · team_abbreviation
  · age
  · gp
  · w
  · l
  · w_pct
  · min
  · fgm
  · fga
  · fg_pct
  · fg3m
  · fg3a
  · fg3_pct
  · ftm
  · fta
  · ft_pct
  · oreb
  · dreb
  · reb
  · ast
  · turnovers
  · stl
  · blk
  · blka
  · pf
  · pfd
  · pts
  · plus_minus
  · nba_fantasy_pts
  · dd2
  · td3
  · wnba_fantasy_pts
  · gp_rank
  · w_rank
  · l_rank
  · w_pct_rank
  · min_rank
  · fgm_rank
  · fga_rank
  · fg_pct_rank
  · fg3m_rank
  · fg3a_rank
  · fg3_pct_rank
  · ftm_rank
  · fta_rank
  · ft_pct_rank
  · oreb_rank
  · dreb_rank
  · reb_rank
  · ast_rank
  · tov_rank
  · stl_rank
  · blk_rank
  · blka_rank
  · pf_rank
  · pfd_rank
  · pts_rank
  · plus_minus_rank
  · nba_fantasy_pts_rank
  · dd2_rank
  · td3_rank
  · wnba_fantasy_pts_rank
  · team_count
  · season
  · season_type
  · measure
  · updated_at

── SQL ───────────────────────────────────────────────────────────────────────
CREATE TABLE player_season_stats (
    id           BIGSERIAL    PRIMARY KEY,
    player_id    INT          REFERENCES players(player_id),
    player_name  VARCHAR(200),
    team_id      INT          REFERENCES teams(team_id),
    team_abbreviation VARCHAR(10),
    season       VARCHAR(10),
    season_type  VARCHAR(30),
    measure      VARCHAR(20),             -- "Base" o "Advanced"
    -- Juego
    gp           SMALLINT,                -- Partidos jugados
    gs           SMALLINT,                -- Partidos como titular
    min          DECIMAL(5,2),            -- Minutos por partido
    -- Tiros (promedios)
    fgm          DECIMAL(5,2), fga  DECIMAL(5,2), fg_pct  DECIMAL(5,3),
    fg3m         DECIMAL(5,2), fg3a DECIMAL(5,2), fg3_pct DECIMAL(5,3),
    ftm          DECIMAL(5,2), fta  DECIMAL(5,2), ft_pct  DECIMAL(5,3),
    -- Rebotes
    oreb         DECIMAL(5,2), dreb DECIMAL(5,2), reb DECIMAL(5,2),
    -- Stats generales
    ast          DECIMAL(5,2), stl DECIMAL(5,2), blk DECIMAL(5,2),
    turnovers    DECIMAL(5,2), pf  DECIMAL(5,2), pts DECIMAL(5,2),
    -- Stats avanzadas (en filas con measure='Advanced')
    net_rating   DECIMAL(7,2),
    ast_pct      DECIMAL(5,3),
    ast_to       DECIMAL(5,2),
    oreb_pct     DECIMAL(5,3),
    dreb_pct     DECIMAL(5,3),
    usg_pct      DECIMAL(5,3),
    ts_pct       DECIMAL(5,3),
    e_fg_pct     DECIMAL(5,3),
    off_rating   DECIMAL(7,2),
    def_rating   DECIMAL(7,2),
    pace         DECIMAL(6,2),
    pie          DECIMAL(5,3),
    updated_at   TIMESTAMP,
    UNIQUE (player_id, team_id, season, season_type, measure)
);

CREATE INDEX idx_pss_player ON player_season_stats(player_id);
CREATE INDEX idx_pss_season ON player_season_stats(season);

── NOTA sobre measure ────────────────────────────────────────────────────────
El CSV tiene dos filas por jugadora/temporada/tipo:
  - measure='Base'     → pts, reb, ast, stl, blk, fg_pct, etc.
  - measure='Advanced' → ts_pct, usg_pct, net_rating, pie, etc.
Podés hacer JOIN o PIVOT según tu motor de base de datos.


════════════════════════════════════════════════════════════════════════════════
8. TABLA: team_season_stats
   Archivo CSV: team_season_stats.csv
   Descripción: Promedios de equipo por temporada (puntos, rebotes,
                victorias/derrotas, etc.).
════════════════════════════════════════════════════════════════════════════════

Columnas detectadas:
    · team_id
  · team_name
  · gp
  · w
  · l
  · w_pct
  · min
  · fgm
  · fga
  · fg_pct
  · fg3m
  · fg3a
  · fg3_pct
  · ftm
  · fta
  · ft_pct
  · oreb
  · dreb
  · reb
  · ast
  · turnovers
  · stl
  · blk
  · blka
  · pf
  · pfd
  · pts
  · plus_minus
  · gp_rank
  · w_rank
  · l_rank
  · w_pct_rank
  · min_rank
  · fgm_rank
  · fga_rank
  · fg_pct_rank
  · fg3m_rank
  · fg3a_rank
  · fg3_pct_rank
  · ftm_rank
  · fta_rank
  · ft_pct_rank
  · oreb_rank
  · dreb_rank
  · reb_rank
  · ast_rank
  · tov_rank
  · stl_rank
  · blk_rank
  · blka_rank
  · pf_rank
  · pfd_rank
  · pts_rank
  · plus_minus_rank
  · season
  · season_type
  · updated_at

── SQL ───────────────────────────────────────────────────────────────────────
CREATE TABLE team_season_stats (
    id           BIGSERIAL   PRIMARY KEY,
    team_id      INT         REFERENCES teams(team_id),
    team_abbreviation VARCHAR(10),
    team_name    VARCHAR(100),
    season       VARCHAR(10),
    season_type  VARCHAR(30),
    gp           SMALLINT,               -- Partidos jugados
    w            SMALLINT,               -- Victorias
    l            SMALLINT,               -- Derrotas
    win_pct      DECIMAL(5,3),           -- Porcentaje de victorias
    min          DECIMAL(5,2),
    fgm          DECIMAL(5,2), fga  DECIMAL(5,2), fg_pct  DECIMAL(5,3),
    fg3m         DECIMAL(5,2), fg3a DECIMAL(5,2), fg3_pct DECIMAL(5,3),
    ftm          DECIMAL(5,2), fta  DECIMAL(5,2), ft_pct  DECIMAL(5,3),
    oreb         DECIMAL(5,2), dreb DECIMAL(5,2), reb     DECIMAL(5,2),
    ast          DECIMAL(5,2), stl  DECIMAL(5,2), blk     DECIMAL(5,2),
    turnovers    DECIMAL(5,2), pf   DECIMAL(5,2), pts     DECIMAL(5,2),
    plus_minus   DECIMAL(6,2),
    updated_at   TIMESTAMP,
    UNIQUE (team_id, season, season_type)
);


════════════════════════════════════════════════════════════════════════════════
ORDEN DE IMPORTACIÓN (respetar por las foreign keys)
════════════════════════════════════════════════════════════════════════════════

  1. teams.csv                         ← sin dependencias
  2. players.csv                       ← depende de teams
  3. games.csv                         ← depende de teams
  4. team_game_stats.csv               ← depende de games + teams
  5. player_game_stats.csv             ← depende de games + players + teams
  6. player_game_stats_advanced.csv    ← depende de games + players
  7. player_season_stats.csv           ← depende de players + teams
  8. team_season_stats.csv             ← depende de teams


════════════════════════════════════════════════════════════════════════════════
IMPORTACIÓN RÁPIDA — SQLITE (Python)
════════════════════════════════════════════════════════════════════════════════

import sqlite3, pandas as pd

conn = sqlite3.connect("wnba.db")
for table in ["teams","players","games","team_game_stats",
              "player_game_stats","player_game_stats_advanced",
              "player_season_stats","team_season_stats"]:
    df = pd.read_csv(f"wnba_data/{table}.csv")
    df.to_sql(table, conn, if_exists="replace", index=False)
    print(f"{table}: {len(df)} filas")
conn.close()


════════════════════════════════════════════════════════════════════════════════
IMPORTACIÓN RÁPIDA — POSTGRESQL
════════════════════════════════════════════════════════════════════════════════

# Instalar: pip install psycopg2 sqlalchemy
from sqlalchemy import create_engine
import pandas as pd

engine = create_engine("postgresql://usuario:password@localhost/wnba_db")
for table in ["teams","players","games","team_game_stats",
              "player_game_stats","player_game_stats_advanced",
              "player_season_stats","team_season_stats"]:
    df = pd.read_csv(f"wnba_data/{table}.csv")
    df.to_sql(table, engine, if_exists="append", index=False, chunksize=1000)
    print(f"{table}: {len(df)} filas cargadas")


════════════════════════════════════════════════════════════════════════════════
CONSULTAS DE EJEMPLO
════════════════════════════════════════════════════════════════════════════════

-- Top 10 anotadoras temporada 2024:
SELECT player_name, team_abbreviation, gp, pts, reb, ast, fg_pct
FROM player_season_stats
WHERE season = '2024' AND season_type = 'Regular Season' AND measure = 'Base'
ORDER BY pts DESC LIMIT 10;

-- Mejor True Shooting % (mín. 15 partidos):
SELECT player_name, team_abbreviation, gp, pts, ts_pct, usg_pct
FROM player_season_stats
WHERE season = '2024' AND measure = 'Advanced' AND gp >= 15
ORDER BY ts_pct DESC LIMIT 10;

-- Partidos donde una jugadora anotó 30+ puntos:
SELECT p.full_name, g.game_date, t.team_abbr,
       pgs.pts, pgs.reb, pgs.ast, pgs.minutes
FROM player_game_stats pgs
JOIN players p ON pgs.player_id = p.player_id
JOIN games   g ON pgs.game_id   = g.game_id
JOIN teams   t ON pgs.team_id   = t.team_id
WHERE pgs.pts >= 30
ORDER BY pgs.pts DESC;

-- Standings 2024:
SELECT team_name, gp, w, l,
       ROUND(w * 100.0 / gp, 1) AS win_pct,
       pts, reb, ast
FROM team_season_stats
WHERE season = '2024' AND season_type = 'Regular Season'
ORDER BY win_pct DESC;


════════════════════════════════════════════════════════════════════════════════
Generado por wnba_csv_exporter.py  —  2026-05-24 09:57:35
════════════════════════════════════════════════════════════════════════════════
