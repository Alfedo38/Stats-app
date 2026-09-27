-- WNBA · limpieza integral de duplicados y separación de plantel actual.
-- Ejecutar una sola vez en Supabase SQL Editor.
-- Crea respaldos de las filas repetidas antes de borrar cualquier duplicado.

begin;

create schema if not exists wnba_backup_20260927;

-- Respaldos: contienen únicamente claves repetidas, no copias completas.
create table if not exists wnba_backup_20260927.teams as
select * from (
  select t.*, count(*) over (partition by team_id) as duplicate_count
  from wnba_api_data.teams t
) x where duplicate_count > 1;

create table if not exists wnba_backup_20260927.players as
select * from (
  select t.*, count(*) over (partition by player_id) as duplicate_count
  from wnba_api_data.players t
) x where duplicate_count > 1;

create table if not exists wnba_backup_20260927.games as
select * from (
  select t.*, count(*) over (partition by game_id) as duplicate_count
  from wnba_api_data.games t
) x where duplicate_count > 1;

create table if not exists wnba_backup_20260927.team_game_stats as
select * from (
  select t.*, count(*) over (partition by game_id, team_id) as duplicate_count
  from wnba_api_data.team_game_stats t
) x where duplicate_count > 1;

create table if not exists wnba_backup_20260927.player_game_stats as
select * from (
  select t.*, count(*) over (partition by game_id, player_id) as duplicate_count
  from wnba_api_data.player_game_stats t
) x where duplicate_count > 1;

create table if not exists wnba_backup_20260927.player_game_stats_advanced as
select * from (
  select t.*, count(*) over (partition by game_id, player_id) as duplicate_count
  from wnba_api_data.player_game_stats_advanced t
) x where duplicate_count > 1;

create table if not exists wnba_backup_20260927.player_season_stats_base as
select * from (
  select t.*, count(*) over (
    partition by player_id, team_id, season, season_type
  ) as duplicate_count
  from wnba_api_data.player_season_stats_base t
) x where duplicate_count > 1;

create table if not exists wnba_backup_20260927.player_season_stats_advanced as
select * from (
  select t.*, count(*) over (
    partition by player_id, team_id, season, season_type
  ) as duplicate_count
  from wnba_api_data.player_season_stats_advanced t
) x where duplicate_count > 1;

create table if not exists wnba_backup_20260927.team_season_stats as
select * from (
  select t.*, count(*) over (
    partition by team_id, season, season_type
  ) as duplicate_count
  from wnba_api_data.team_season_stats t
) x where duplicate_count > 1;

-- Tablas maestras: conservar el registro vigente/más reciente.
with ranked as (
  select ctid, row_number() over (
    partition by team_id order by updated_at desc nulls last, ctid desc
  ) as rn
  from wnba_api_data.teams
  where team_id is not null
)
delete from wnba_api_data.teams t using ranked r
where t.ctid = r.ctid and r.rn > 1;

with ranked as (
  select ctid, row_number() over (
    partition by player_id
    order by (coalesce(is_active, 0) = 1) desc, updated_at desc nulls last, ctid desc
  ) as rn
  from wnba_api_data.players
  where player_id is not null
)
delete from wnba_api_data.players t using ranked r
where t.ctid = r.ctid and r.rn > 1;

with ranked as (
  select ctid, row_number() over (
    partition by game_id order by updated_at desc nulls last, ctid desc
  ) as rn
  from wnba_api_data.games
  where game_id is not null
)
delete from wnba_api_data.games t using ranked r
where t.ctid = r.ctid and r.rn > 1;

-- Box scores: una fila por entidad y partido.
with ranked as (
  select ctid, row_number() over (
    partition by game_id, team_id order by updated_at desc nulls last, ctid desc
  ) as rn
  from wnba_api_data.team_game_stats
  where game_id is not null and team_id is not null
)
delete from wnba_api_data.team_game_stats t using ranked r
where t.ctid = r.ctid and r.rn > 1;

with ranked as (
  select ctid, row_number() over (
    partition by game_id, player_id order by updated_at desc nulls last, ctid desc
  ) as rn
  from wnba_api_data.player_game_stats
  where game_id is not null and player_id is not null
)
delete from wnba_api_data.player_game_stats t using ranked r
where t.ctid = r.ctid and r.rn > 1;

with ranked as (
  select ctid, row_number() over (
    partition by game_id, player_id order by updated_at desc nulls last, ctid desc
  ) as rn
  from wnba_api_data.player_game_stats_advanced
  where game_id is not null and player_id is not null
)
delete from wnba_api_data.player_game_stats_advanced t using ranked r
where t.ctid = r.ctid and r.rn > 1;

-- Acumulados: conservar el snapshot más completo (mayor GP) y luego el más reciente.
with ranked as (
  select ctid, row_number() over (
    partition by player_id, team_id, season, season_type
    order by gp desc nulls last, updated_at desc nulls last, ctid desc
  ) as rn
  from wnba_api_data.player_season_stats_base
  where player_id is not null and team_id is not null
)
delete from wnba_api_data.player_season_stats_base t using ranked r
where t.ctid = r.ctid and r.rn > 1;

with ranked as (
  select ctid, row_number() over (
    partition by player_id, team_id, season, season_type
    order by gp desc nulls last, updated_at desc nulls last, ctid desc
  ) as rn
  from wnba_api_data.player_season_stats_advanced
  where player_id is not null and team_id is not null
)
delete from wnba_api_data.player_season_stats_advanced t using ranked r
where t.ctid = r.ctid and r.rn > 1;

with ranked as (
  select ctid, row_number() over (
    partition by team_id, season, season_type
    order by gp desc nulls last, updated_at desc nulls last, ctid desc
  ) as rn
  from wnba_api_data.team_season_stats
  where team_id is not null
)
delete from wnba_api_data.team_season_stats t using ranked r
where t.ctid = r.ctid and r.rn > 1;

-- Barreras permanentes contra nuevas duplicaciones.
create unique index if not exists uq_wnba_teams_team
  on wnba_api_data.teams (team_id) where team_id is not null;
create unique index if not exists uq_wnba_players_player
  on wnba_api_data.players (player_id) where player_id is not null;
create unique index if not exists uq_wnba_games_game
  on wnba_api_data.games (game_id) where game_id is not null;
create unique index if not exists uq_wnba_team_game
  on wnba_api_data.team_game_stats (game_id, team_id)
  where game_id is not null and team_id is not null;
create unique index if not exists uq_wnba_player_game
  on wnba_api_data.player_game_stats (game_id, player_id)
  where game_id is not null and player_id is not null;
create unique index if not exists uq_wnba_player_game_advanced
  on wnba_api_data.player_game_stats_advanced (game_id, player_id)
  where game_id is not null and player_id is not null;
create unique index if not exists uq_wnba_player_season_base
  on wnba_api_data.player_season_stats_base (player_id, team_id, season, season_type)
  where player_id is not null and team_id is not null;
create unique index if not exists uq_wnba_player_season_advanced
  on wnba_api_data.player_season_stats_advanced (player_id, team_id, season, season_type)
  where player_id is not null and team_id is not null;
create unique index if not exists uq_wnba_team_season
  on wnba_api_data.team_season_stats (team_id, season, season_type)
  where team_id is not null;

-- Esta vista representa únicamente el plantel vigente. Las estadísticas
-- históricas permanecen separadas en v_wnba_team_roster y demás vistas.
create or replace view public.v_wnba_current_roster
with (security_invoker = true) as
select
  p.player_id,
  p.full_name as player_name,
  p.team_id,
  p.team_abbr,
  p.jersey,
  p.position,
  p.height,
  p.weight,
  p.country,
  p.school,
  p.experience,
  p.updated_at
from wnba_api_data.players p
where coalesce(p.is_active, 0) = 1
  and p.team_id is not null;

grant select on public.v_wnba_current_roster to anon, authenticated, service_role;

commit;

-- Resultado esperado: cero filas en todas las secciones.
select 'teams' as tabla, team_id::text as clave, count(*) as repeticiones
from wnba_api_data.teams group by team_id having count(*) > 1
union all
select 'players', player_id::text, count(*)
from wnba_api_data.players group by player_id having count(*) > 1
union all
select 'games', game_id::text, count(*)
from wnba_api_data.games group by game_id having count(*) > 1
union all
select 'player_game_stats', concat(game_id, ':', player_id), count(*)
from wnba_api_data.player_game_stats group by game_id, player_id having count(*) > 1
union all
select 'player_game_stats_advanced', concat(game_id, ':', player_id), count(*)
from wnba_api_data.player_game_stats_advanced group by game_id, player_id having count(*) > 1
union all
select 'player_season_stats_base', concat(player_id, ':', team_id, ':', season, ':', season_type), count(*)
from wnba_api_data.player_season_stats_base group by player_id, team_id, season, season_type having count(*) > 1
union all
select 'player_season_stats_advanced', concat(player_id, ':', team_id, ':', season, ':', season_type), count(*)
from wnba_api_data.player_season_stats_advanced group by player_id, team_id, season, season_type having count(*) > 1
union all
select 'team_season_stats', concat(team_id, ':', season, ':', season_type), count(*)
from wnba_api_data.team_season_stats group by team_id, season, season_type having count(*) > 1;
