import { normalizeSeasonType, seasonTypes, uniqueRows, combineSeasonRows, readAllRows } from "@/lib/wnba/seasonScope";
import { requirePageUser } from '@/lib/auth/server';
import WNBAPlayerChartPanel from "@/components/wnba/WNBAPlayerChartPanel";
import WNBAAbsenceImpact, { type WNBATeammateGame } from "@/components/wnba/WNBAAbsenceImpact";
import WNBAPlayerMatchups, { type WNBAMatchup } from "@/components/wnba/WNBAPlayerMatchups";
import WNBAQuickSwitcher, { type WNBASwitchTeam } from "@/components/wnba/WNBAQuickSwitcher";
import WNBAShotChart, { type WNBAShot } from "@/components/wnba/WNBAShotChart";
import { getWNBATeamTheme } from "@/components/wnba/wnbaTeamColors";
import { createClient } from "@supabase/supabase-js";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

type Params = Promise<{ playerId: string }>;
type SearchParams =
  | Record<string, string | string[] | undefined>
  | Promise<Record<string, string | string[] | undefined>>;

type Profile = {
  player_id: number;
  player_name: string;
  team_id: number;
  team_abbr: string;
  jersey: string | null;
  position: string | null;
  height: string | null;
  country: string | null;
  school: string | null;
  season: string;
  season_type: string;
  gp: number | null;
  min: number | null;
  pts: number | null;
  reb: number | null;
  ast: number | null;
  stl: number | null;
  blk: number | null;
  turnovers: number | null;
  fg_pct: number | null;
  fg3_pct: number | null;
  ft_pct: number | null;
  ts_pct: number | null;
  usg_pct: number | null;
  pie: number | null;
};

type Log = {
  game_id: string;
  game_date: string;
  player_id: number;
  player_name: string;
  team_id?: number | null;
  team_abbreviation: string;
  opponent_abbr: string;
  home_away: string;
  wl: string | null;
  minutes: string | number | null;
  pts: number | null;
  reb: number | null;
  ast: number | null;
  stl: number | null;
  blk: number | null;
  turnovers: number | null;
  pf?: number | null;
  fgm: number | null;
  fga: number | null;
  fg_pct: number | null;
  fg3m: number | null;
  fg3a: number | null;
  fg3_pct: number | null;
  ftm: number | null;
  fta: number | null;
  ft_pct: number | null;
  plus_minus: number | null;
  ts_pct: number | null;
  usg_pct: number | null;
  pie?: number | null;
  start_position?: string | null;
  comment?: string | null;
};

type RosterRow = {
  player_id: number;
  player_name: string;
  team_id: number;
  team_abbr: string;
  gp: number | null;
  season_type: string;
  pts: number | null;
  reb: number | null;
  ast: number | null;
};

type TeammateGameRow = {
  game_id: string;
  player_id: number;
  player_name: string;
  team_id?: number | null;
  team_abbreviation?: string | null;
  minutes?: string | number | null;
  comment?: string | null;
  start_position?: string | null;
  pts?: number | null;
  reb?: number | null;
  ast?: number | null;
};

function getOne(value: string | string[] | undefined, fallback: string) {
  if (Array.isArray(value)) return value[0] ?? fallback;
  return value ?? fallback;
}

function toNumber(value: unknown, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function minutesNum(value: any) {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const raw = String(value).trim();
  if (raw.includes(":")) {
    const [m, s] = raw.split(":").map(Number);
    return (Number.isFinite(m) ? m : 0) + (Number.isFinite(s) ? s / 60 : 0);
  }
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function fmt(value: number | null | undefined, digits = 1) {
  if (value === null || value === undefined) return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return n.toFixed(digits);
}

function pct(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return `${(n * 100).toFixed(1)}%`;
}

function splitName(playerName: string) {
  const parts = playerName.trim().split(/\s+/).filter(Boolean);
  const firstName = parts[0] || "Jugadora";
  const lastName = parts.slice(1).join(" ") || "WNBA";
  return { firstName, lastName };
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
}

function normalizeDate(value: unknown) {
  const raw = value ? String(value) : "";
  return raw.includes("T") ? raw : `${raw}T12:00:00`;
}

function getMatchup(row: Log) {
  const opponent = row.opponent_abbr || "---";
  const loc = String(row.home_away).toUpperCase() === "AWAY" ? "@" : "vs";
  return `${row.team_abbreviation || "WNBA"} ${loc} ${opponent}`;
}

function prepareStats(logs: Log[]) {
  return logs
    .map((row) => {
      const pts = toNumber(row.pts);
      const reb = toNumber(row.reb);
      const ast = toNumber(row.ast);
      const stl = toNumber(row.stl);
      const blk = toNumber(row.blk);
      const turnovers = toNumber(row.turnovers);
      const fg3m = toNumber(row.fg3m);
      const fg3a = toNumber(row.fg3a);
      const min = minutesNum(row.minutes);

      return {
        ...row,
        game_date: normalizeDate(row.game_date),
        matchup: getMatchup(row),
        min,
        minutes: row.minutes,
        pts,
        reb,
        ast,
        fgm: toNumber(row.fgm),
        fga: toNumber(row.fga),
        fg3m,
        fg3a,
        blk,
        stl,
        tov: turnovers,
        turnovers,
        pf: toNumber(row.pf),
        pts_reb: pts + reb,
        pts_ast: pts + ast,
        reb_ast: reb + ast,
        pts_reb_ast: pts + reb + ast,
        pra: pts + reb + ast,
        stl_blk: stl + blk,
        usage_pct: toNumber(row.usg_pct),
        ts_pct: toNumber(row.ts_pct),
      };
    })
    .filter((row) => row.min > 0)
    .sort((a, b) => new Date(b.game_date || 0).getTime() - new Date(a.game_date || 0).getTime());
}

export default async function WNBAPlayerPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams?: SearchParams;
}) {
  await requirePageUser();
  try {
    const { playerId } = await params;
    const sp = await Promise.resolve(searchParams ?? {});
    const season = getOne(sp.season, "2026");
    const seasonType = normalizeSeasonType(getOne(sp.season_type, "ALL"));

    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey =
      process.env.SUPABASE_SERVICE_KEY ||
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return <main className="min-h-screen p-6 text-[var(--text)]">Faltan variables de Supabase.</main>;
    }

    const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

    const [profileRes, logsRes, teamsRes] = await Promise.all([
      supabase
        .from("v_wnba_team_roster")
        .select("*")
        .eq("player_id", Number(playerId))
        .eq("season", season)
        .in("season_type", seasonTypes(seasonType))
        .order("season_type", { ascending: true })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("v_wnba_player_game_logs")
        .select("*")
        .eq("player_id", Number(playerId))
        .eq("season", season)
        .in("season_type", seasonTypes(seasonType))
        .order("game_date", { ascending: false })
        .order("game_id", { ascending: false })
        .limit(1000),
      supabase
        .from("v_wnba_teams")
        .select("team_id, team_abbr, team_name")
        .eq("season", season)
        .in("season_type", seasonTypes(seasonType))
        .order("team_name", { ascending: true }),
    ]);

    if (profileRes.error) throw profileRes.error;
    if (logsRes.error) throw logsRes.error;
    if (teamsRes.error) throw teamsRes.error;

    let profile = profileRes.data as Profile | null;
    const rawLogs = uniqueRows((logsRes.data ?? []) as Log[], (row) => String(row.game_id));
    const cleanStats = prepareStats(rawLogs);
    if (seasonType === "ALL" && profile) {
      const average = (key: string) => {
        const values = cleanStats.map((row) => (row as Record<string, unknown>)[key])
          .filter((value) => value != null && Number.isFinite(Number(value)));
        return values.length ? values.reduce<number>((sum, value) => sum + Number(value), 0) / values.length : null;
      };
      const shootingPct = (made: "fgm" | "fg3m" | "ftm", attempted: "fga" | "fg3a" | "fta") => {
        const attempts = cleanStats.reduce((sum, row) => sum + toNumber(row[attempted]), 0);
        return attempts ? cleanStats.reduce((sum, row) => sum + toNumber(row[made]), 0) / attempts : null;
      };
      const attempts = cleanStats.reduce((sum, row) => sum + toNumber(row.fga) + 0.44 * toNumber(row.fta), 0);
      profile = { ...profile, gp: cleanStats.length, min: average("min"),
        pts: average("pts"), reb: average("reb"), ast: average("ast"),
        stl: average("stl"), blk: average("blk"), turnovers: average("turnovers"),
        fg_pct: shootingPct("fgm", "fga"), fg3_pct: shootingPct("fg3m", "fg3a"),
        ft_pct: shootingPct("ftm", "fta"),
        ts_pct: attempts ? cleanStats.reduce((sum, row) => sum + row.pts, 0) / (2 * attempts) : null,
        // Approximate season usage using playing-time weights. Shooting
        // percentages above come from totals, rather than averaged percentages.
        usg_pct: (() => {
          const games = cleanStats.filter((row) => row.usg_pct != null);
          const minutes = games.reduce((sum, row) => sum + row.min, 0);
          return minutes ? games.reduce((sum, row) => sum + toNumber(row.usg_pct) * row.min, 0) / minutes : null;
        })(), pie: null,
      };
    }

    const playerName = profile?.player_name || rawLogs?.[0]?.player_name || "Jugadora WNBA";
    const { firstName, lastName } = splitName(playerName);
    const teamAbbr = profile?.team_abbr || cleanStats.find((s: any) => s?.team_abbreviation)?.team_abbreviation || null;
    const teamId = profile?.team_id || cleanStats.find((s: any) => s?.team_id)?.team_id || null;

    // Para analizar una ausencia necesitamos también los partidos donde la
    // jugadora del perfil no disputó minutos. Por eso se consulta toda la
    // temporada de su equipo, no solamente sus propios game_id.
    const teamSeasonGamesRes = teamId
      ? await readAllRows<TeammateGameRow>(() => supabase
          .from("v_wnba_player_game_logs")
          .select("*")
          .eq("team_id", Number(teamId))
          .eq("season", season)
          .in("season_type", seasonTypes(seasonType))
          .order("game_id", { ascending: true })
          .order("player_id", { ascending: true }))
      : { data: [], error: null };

    if (teamSeasonGamesRes.error) throw teamSeasonGamesRes.error;

    const teamSeasonGames = uniqueRows((teamSeasonGamesRes.data ?? []) as TeammateGameRow[], (row) => `${row.game_id}:${row.player_id}`);
    const teammateGames = teamSeasonGames
      .filter((row) => Number(row.player_id) !== Number(playerId));

    const rosterRes = teamId
      ? await supabase
          .from("v_wnba_team_roster")
          .select("player_id, player_name, team_id, team_abbr, gp, season_type, pts, reb, ast")
          .eq("team_id", Number(teamId))
          .eq("season", season)
          .in("season_type", seasonTypes(seasonType))
          .order("pts", { ascending: false })
      : { data: [], error: null };

    if (rosterRes.error) throw rosterRes.error;

    // Estas dos vistas se agregan con los paquetes de contexto. Si todavía no se
    // ejecutó el SQL, el resto del perfil debe continuar funcionando.
    const [shotsRes, matchupsRes] = await Promise.all([
      readAllRows<WNBAShot>(() => supabase
        .from("v_wnba_player_shots")
        .select("*")
        .eq("player_id", Number(playerId))
        .eq("season", season)
        .in("season_type", seasonTypes(seasonType))
        .order("game_date", { ascending: false })
        .order("game_id", { ascending: false })
        .order("game_event_id", { ascending: true })),
      supabase
        .from("v_wnba_player_season_matchups")
        .select("*")
        .eq("offensive_player_id", Number(playerId))
        .eq("season", season)
        .in("season_type", seasonTypes(seasonType))
        .order("partial_possessions", { ascending: false })
        .limit(1000),
    ]);

    if (shotsRes.error) console.warn("WNBA_SHOTS_OPTIONAL:", shotsRes.error.message);
    if (matchupsRes.error) console.warn("WNBA_MATCHUPS_OPTIONAL:", matchupsRes.error.message);
    const shots = uniqueRows((shotsRes.error ? [] : shotsRes.data ?? []) as WNBAShot[], (row) => `${row.game_id}:${row.game_event_id}`);
    const matchups = (matchupsRes.error ? [] : matchupsRes.data ?? []) as WNBAMatchup[];

    const teammates = combineSeasonRows((rosterRes.data ?? []) as RosterRow[], ["pts", "reb", "ast"]).map((p) => ({
      id: p.player_id,
      full_name: p.player_name,
      player_name: p.player_name,
      team_abbreviation: p.team_abbr,
      team_abbr: p.team_abbr,
      pts: p.pts,
      reb: p.reb,
      ast: p.ast,
    }));

    const pra = Number(profile?.pts || 0) + Number(profile?.reb || 0) + Number(profile?.ast || 0);
    const teamTheme = getWNBATeamTheme(teamAbbr);
    const switchTeams = uniqueRows((teamsRes.data ?? []) as WNBASwitchTeam[], (team) => String(team.team_id));

    return (
      <main className="min-h-screen text-[var(--text)] pb-20" style={{ background: `radial-gradient(circle at 8% 0%, ${teamTheme.glow}, transparent 28%), radial-gradient(circle at 100% 14%, ${teamTheme.soft}, transparent 22%), var(--bg)` }}>
        <div className="p-4 pt-20 md:p-8 md:pt-8 max-w-[1560px] mx-auto space-y-5">
          <section className="relative overflow-hidden rounded-[1.75rem] border p-5 md:p-7" style={{ borderColor: `${teamTheme.primary}55`, background: `linear-gradient(135deg, ${teamTheme.soft}, rgba(5,9,15,.97) 46%, rgba(3,6,10,.98))`, boxShadow: `0 0 38px ${teamTheme.glow}` }}>
            <div className="pointer-events-none absolute -right-10 -top-14 text-[11rem] font-black italic leading-none opacity-[0.055]" style={{ color: teamTheme.primary }}>{String(teamAbbr || "WN").toUpperCase()}</div>
            <Link
              href={teamId ? `/wnba/teams/${teamId}?season=${season}&season_type=${encodeURIComponent(seasonType)}` : "/wnba/players"}
              className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)] mb-5 relative z-10"
            >
              <ArrowLeft size={14} /> Volver
            </Link>

            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-5">
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-[0.28em] mb-2" style={{ color: teamTheme.primary }}>Análisis de jugadora</p>
                <h1 className="text-[clamp(2.5rem,6vw,5.6rem)] font-black italic tracking-tighter leading-[0.9] uppercase break-words">
                  {firstName} <span style={{ color: teamTheme.primary }}>{lastName}</span>
                </h1>
                <p className="mt-3 text-[10px] md:text-xs text-[var(--text-muted)] font-black uppercase tracking-[0.18em]">
                  {[teamAbbr || "WNBA", profile?.jersey ? `#${profile.jersey}` : null, profile?.position || null, `${cleanStats.length} PJ`, season, seasonType === "ALL" ? "Regular + Playoffs" : seasonType === "Playoffs" ? "Playoffs" : "Temporada regular"].filter(Boolean).join(" · ")}
                </p>
              </div>

              <div className="hidden md:flex h-20 w-20 rounded-3xl border items-center justify-center text-3xl font-black relative z-10" style={{ borderColor: `${teamTheme.primary}55`, background: teamTheme.soft, color: teamTheme.primary }}>
                {initials(playerName)}
              </div>
            </div>
          </section>

          <form key={`${season}:${seasonType}`} className="flex flex-wrap items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3">
            <label className="text-xs font-bold" htmlFor="wnba-season">Temporada</label>
            <select id="wnba-season" name="season" defaultValue={season} className="rounded-xl border border-white/10 bg-[#07131a] px-3 py-2 text-xs font-bold">
              {["2026", "2025", "2024"].map((year) => <option key={year} value={year}>{year}</option>)}
            </select>
            <label className="text-xs font-bold" htmlFor="wnba-phase">Fase</label>
            <select id="wnba-phase" name="season_type" defaultValue={seasonType} className="rounded-xl border border-white/10 bg-[#07131a] px-3 py-2 text-xs font-bold">
              <option value="ALL">Todos · Regular + Playoffs</option>
              <option value="Regular Season">Temporada regular</option>
              <option value="Playoffs">Playoffs</option>
            </select>
            <button className="rounded-xl px-4 py-2 text-xs font-black text-black" style={{ background: teamTheme.primary }}>Ver partidos</button>
          </form>

          <section className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <Metric label="MIN" value={fmt(profile?.min)} />
            <Metric label="PTS" value={fmt(profile?.pts)} />
            <Metric label="REB" value={fmt(profile?.reb)} />
            <Metric label="AST" value={fmt(profile?.ast)} />
            <Metric label="PRA" value={fmt(pra)} strong color={teamTheme.primary} />
          </section>

          <details className="group rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
            <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-[9px] font-black uppercase tracking-[0.22em] text-[var(--text-muted)]"><span>Datos avanzados</span><span className="transition-transform group-open:rotate-45">＋</span></summary>
            <div className="grid grid-cols-3 gap-3 border-t border-[var(--border)] p-3 md:grid-cols-6">
              <Metric label={seasonType === "ALL" ? "USG% aprox." : "USG%"} value={pct(profile?.usg_pct)} />
              <Metric label="TS%" value={pct(profile?.ts_pct)} />
              <Metric label="FG%" value={pct(profile?.fg_pct)} />
              <Metric label="3P%" value={pct(profile?.fg3_pct)} />
              <Metric label="STL" value={fmt(profile?.stl)} />
              <Metric label="BLK" value={fmt(profile?.blk)} />
            </div>
          </details>

          <nav className="sticky top-2 z-20 flex gap-2 overflow-x-auto rounded-2xl border border-white/10 bg-[#05090f]/90 p-2 shadow-xl shadow-black/20 backdrop-blur" aria-label="Secciones del análisis">
            {[["#rendimiento", "Rendimiento"], ["#tiros", "Tiros por partido"], ["#defensa", "Quién la defendió"], ["#ausencias", "Reemplazantes"]].map(([href, label], index) => <a key={href} href={href} className="whitespace-nowrap rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-[8px] font-black uppercase tracking-widest text-slate-300 transition hover:border-white/25 hover:text-white"><span className="mr-1.5 text-[var(--text-muted)]">0{index + 1}</span>{label}</a>)}
          </nav>

          <div id="rendimiento" className="scroll-mt-20"><WNBAPlayerChartPanel
              stats={cleanStats}
              teamAbbr={teamAbbr ? String(teamAbbr).toUpperCase() : null}
              teammateGames={teammateGames}
            /></div>
          <div id="tiros" className="scroll-mt-20"><WNBAShotChart
              shots={shots}
              teamAbbr={teamAbbr ? String(teamAbbr).toUpperCase() : null}
            /></div>
          <div id="defensa" className="scroll-mt-20"><WNBAPlayerMatchups
              rows={matchups}
              teamAbbr={teamAbbr ? String(teamAbbr).toUpperCase() : null}
            /></div>
          <div id="ausencias" className="scroll-mt-20"><WNBAAbsenceImpact
              playerId={Number(playerId)}
              playerName={playerName}
              teamGames={teamSeasonGames as WNBATeammateGame[]}
              playerPosition={profile?.position}
              teamAbbr={teamAbbr ? String(teamAbbr).toUpperCase() : null}
            /></div>
        </div>
        <WNBAQuickSwitcher
          teams={switchTeams}
          players={teammates}
          currentTeamId={teamId}
          currentPlayerId={playerId}
          teamAbbr={teamAbbr}
          season={season}
          seasonType={seasonType}
        />
      </main>
    );
  } catch (error: any) {
    console.error("WNBA_PLAYER_PAGE_ERROR:", error);
    return (
      <main className="min-h-screen bg-[var(--bg)] text-[var(--text)] flex flex-col items-center justify-center p-10 text-center">
        <h1 className="text-red-500 font-black text-3xl mb-4 uppercase tracking-tighter">Error al cargar la jugadora WNBA</h1>
        <p className="text-[var(--text-muted)] text-xs font-bold uppercase tracking-widest">{error?.message || "Intentá de nuevo"}</p>
        <Link href="/wnba/players" className="mt-8 border border-[var(--border)] px-6 py-3 rounded-xl uppercase text-xs font-black tracking-widest hover:text-[#10b981]">Volver a jugadoras</Link>
      </main>
    );
  }
}

function Metric({ label, value, strong = false, color }: { label: string; value: string; strong?: boolean; color?: string }) {
  return (
    <div
      className="rounded-2xl border px-4 py-3"
      style={{
        borderColor: strong && color ? `${color}66` : "var(--border)",
        background: strong && color ? `${color}17` : "var(--surface)",
      }}
    >
      <p className="text-[8px] font-black uppercase tracking-widest text-[var(--text-muted)]">{label}</p>
      <p className="mt-1 text-2xl font-black italic tracking-tighter" style={{ color: strong && color ? color : undefined }}>{value}</p>
    </div>
  );
}
