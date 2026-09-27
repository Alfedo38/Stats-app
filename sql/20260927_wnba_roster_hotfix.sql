-- Hotfix posterior a la limpieza inicial.
-- Permite consultar la vista pública sin exponer la tabla privada players.

begin;

alter view public.v_wnba_current_roster
  set (security_invoker = false);

grant select on public.v_wnba_current_roster
  to anon, authenticated, service_role;

commit;

select team_abbr, count(*) as jugadoras
from public.v_wnba_current_roster
group by team_abbr
order by team_abbr;
