import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import { CalendarDays, ChevronLeft, ChevronRight, Clock, Trophy, Users } from "lucide-react";
import { getWNBATeamTheme } from "@/components/wnba/wnbaTeamColors";

export const dynamic = "force-dynamic";

type RawSearchParams =
  | Record<string, string | string[] | undefined>
  | Promise<Record<string, string | string[] | undefined>>;

type DailyGame = {
  id: number;
  game_date: string;
  scheduled_at: string | null;
  status_state: string | null;
  status_name: string | null;
  status_detail: string | null;
  away_team_abbr: string;
  away_team_name: string;
  away_team_logo: string | null;
  away_score: number | null;
  home_team_abbr: string;
  home_team_name: string;
  home_team_logo: string | null;
  home_score: number | null;
};

type PlayerLeader = {
  player_id: number;
  player_name: string | null;
  team_abbr: string | null;
  gp: number | null;
  min: number | null;
  pts: number | null;
  reb: number | null;
  ast: number | null;
};

function getOne(value: string | string[] | undefined, fallback: string) {
  if (Array.isArray(value)) return value[0] ?? fallback;
  return value ?? fallback;
}

function argentinaToday() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const d = parts.find((p) => p.type === "day")?.value;
  return `${y}-${m}-${d}`;
}

function addDays(dateStr: string, days: number) {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function qs(params: Record<string, string>) {
  return `?${new URLSearchParams(params).toString()}`;
}

function fmt(value: number | null | undefined, digits = 1) {
  if (value === null || value === undefined) return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return n.toFixed(digits);
}

function score(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  return String(value);
}

function timeAR(iso: string | null) {
  if (!iso) return "A confirmar";
  try {
    return new Intl.DateTimeFormat("es-AR", {
      timeZone: "America/Argentina/Buenos_Aires",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return "A confirmar";
  }
}

function statusLabel(game: DailyGame) {
  const state = String(game.status_state ?? "").toLowerCase();
  const name = String(game.status_name ?? "").toLowerCase();
  if (state === "post" || name.includes("final")) return "FINAL";
  if (state === "in" || name.includes("progress")) return "EN VIVO";
  return "PROGRAMADO";
}

function TeamLogo({ abbr, logo }: { abbr: string; logo: string | null }) {
  const theme = getWNBATeamTheme(abbr);
  return (
    <div
      className="h-12 w-12 shrink-0 rounded-2xl border flex items-center justify-center overflow-hidden"
      style={{ borderColor: `${theme.primary}55`, background: theme.soft, boxShadow: `0 0 18px ${theme.glow}` }}
    >
      {logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logo} alt={abbr} className="h-9 w-9 object-contain" />
      ) : (
        <span className="text-xs font-black" style={{ color: theme.primary }}>{abbr}</span>
      )}
    </div>
  );
}

function GameCard({ game }: { game: DailyGame }) {
  const label = statusLabel(game);
  const final = label === "FINAL";
  const live = label === "EN VIVO";
  const awayTheme = getWNBATeamTheme(game.away_team_abbr);
  const homeTheme = getWNBATeamTheme(game.home_team_abbr);

  return (
    <article
      className="relative overflow-hidden rounded-[1.5rem] border p-5 transition-colors"
      style={{
        borderColor: `${awayTheme.primary}28`,
        background: `linear-gradient(135deg, ${awayTheme.soft}, rgba(4,8,14,.96) 42%, ${homeTheme.soft})`,
        boxShadow: `inset 0 1px 0 rgba(255,255,255,.035)`,
      }}
    >
      <div className="pointer-events-none absolute -right-8 -bottom-10 text-[7rem] font-black italic leading-none opacity-[0.045]" style={{ color: homeTheme.primary }}>
        {game.home_team_abbr}
      </div>
      <div className="flex items-center justify-between gap-3 mb-5 relative z-10">
        <span className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-widest ${live ? "border-red-400/40 bg-red-500/10 text-red-300" : final ? "border-[#10b981]/40 bg-[#10b981]/10 text-[#10b981]" : "border-white/10 text-[var(--text-muted)]"}`}>
          {label}
        </span>
        <span className="text-xs font-black text-[var(--text-muted)] flex items-center gap-2">
          <Clock size={13} /> {timeAR(game.scheduled_at)}
        </span>
      </div>

      <div className="space-y-4 relative z-10">
        <TeamLine abbr={game.away_team_abbr} name={game.away_team_name} logo={game.away_team_logo} score={score(game.away_score)} />
        <TeamLine abbr={game.home_team_abbr} name={game.home_team_name} logo={game.home_team_logo} score={score(game.home_score)} />
      </div>

      {game.status_detail && (
        <p className="mt-4 truncate text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)] relative z-10">
          {game.status_detail}
        </p>
      )}
    </article>
  );
}

function TeamLine({ abbr, name, logo, score }: { abbr: string; name: string; logo: string | null; score: string }) {
  const theme = getWNBATeamTheme(abbr);
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex items-center gap-3 min-w-0">
        <TeamLogo abbr={abbr} logo={logo} />
        <div className="min-w-0">
          <p className="text-xl font-black uppercase tracking-tight" style={{ color: theme.primary }}>{abbr}</p>
          <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)] truncate">{name}</p>
        </div>
      </div>
      <p className="text-4xl font-black tracking-tighter">{score}</p>
    </div>
  );
}

function PlayerRow({ player, rank }: { player: PlayerLeader; rank: number }) {
  const theme = getWNBATeamTheme(player.team_abbr);
  return (
    <Link
      href={`/wnba/players/${player.player_id}`}
      className="grid grid-cols-[34px_minmax(0,1fr)_72px_72px_72px] items-center gap-3 rounded-2xl border px-4 py-3 transition-colors"
      style={{ borderColor: `${theme.primary}25`, background: `linear-gradient(90deg, ${theme.soft}, rgba(5,9,15,.88))` }}
    >
      <span className="h-8 w-8 rounded-xl border flex items-center justify-center text-xs font-black" style={{ background: theme.soft, borderColor: `${theme.primary}55`, color: theme.primary }}>{rank}</span>
      <div className="min-w-0">
        <p className="truncate text-sm font-black uppercase tracking-tight">{player.player_name || "Jugadora"}</p>
        <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">{player.team_abbr || "WNBA"} · {fmt(player.min)} MIN</p>
      </div>
      <Metric label="PTS" value={fmt(player.pts)} />
      <Metric label="REB" value={fmt(player.reb)} />
      <Metric label="AST" value={fmt(player.ast)} />
    </Link>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-right">
      <p className="text-[8px] font-black uppercase tracking-widest text-[var(--text-muted)]">{label}</p>
      <p className="text-lg font-black tracking-tighter">{value}</p>
    </div>
  );
}

export default async function WNBADashboardPage({ searchParams }: { searchParams?: RawSearchParams }) {
  const sp = await Promise.resolve(searchParams ?? {});
  const today = argentinaToday();
  const selectedDate = getOne(sp.date, today);
  const prevDate = addDays(selectedDate, -1);
  const nextDate = addDays(selectedDate, 1);

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return <main className="min-h-screen p-6 text-[var(--text)]">Faltan variables de Supabase.</main>;
  }

  const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

  const [gamesRes, leadersRes] = await Promise.all([
    supabase
      .from("v_wnba_daily_games")
      .select("*")
      .eq("game_date", selectedDate)
      .order("scheduled_at", { ascending: true }),
    supabase
      .from("v_wnba_team_roster")
      .select("player_id, player_name, team_abbr, gp, min, pts, reb, ast, season, season_type")
      .eq("season", "2026")
      .eq("season_type", "Regular Season")
      .order("pts", { ascending: false })
      .limit(12),
  ]);

  const games = (gamesRes.data ?? []) as DailyGame[];
  const leaders = (leadersRes.data ?? []) as PlayerLeader[];

  return (
    <main className="min-h-screen p-4 pt-20 md:p-8 md:pt-8 text-[var(--text)]" style={{ background: "radial-gradient(circle at 8% 0%, rgba(16,185,129,.16), transparent 28%), radial-gradient(circle at 100% 18%, rgba(124,58,237,.13), transparent 22%), var(--bg)" }}>
      <section className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.32em] text-[#10b981]">WNBA</p>
          <h1 className="mt-1 text-4xl md:text-6xl font-black italic uppercase tracking-tighter leading-none">Partidos y jugadoras</h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link href={qs({ date: prevDate })} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-xs font-black uppercase tracking-widest hover:border-[#10b981]/45 flex items-center gap-2">
            <ChevronLeft size={14} /> Ayer
          </Link>
          <form className="flex items-center gap-2">
            <input type="date" name="date" defaultValue={selectedDate} className="rounded-xl border border-white/10 bg-[#07131a] px-4 py-3 text-xs font-black text-white outline-none" />
            <button className="rounded-xl bg-[#10b981] px-4 py-3 text-xs font-black uppercase tracking-widest text-black flex items-center gap-2">
              <CalendarDays size={14} /> Ver
            </button>
          </form>
          <Link href={qs({ date: nextDate })} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-xs font-black uppercase tracking-widest hover:border-[#10b981]/45 flex items-center gap-2">
            Mañana <ChevronRight size={14} />
          </Link>
        </div>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.15fr)_minmax(420px,0.85fr)] gap-6 items-start">
        <div className="rounded-[1.65rem] border border-[var(--border)] bg-[rgba(5,9,15,.84)] p-4 md:p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.28em] text-[#10b981] flex items-center gap-2"><Trophy size={13} /> Partidos del día</p>
              <h2 className="mt-1 text-2xl font-black italic uppercase tracking-tighter">{selectedDate}</h2>
            </div>
            <p className="rounded-full border border-[var(--border)] px-3 py-1 text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">{games.length} juegos</p>
          </div>

          {games.length ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {games.map((game) => <GameCard key={game.id} game={game} />)}
            </div>
          ) : (
            <div className="rounded-[1.5rem] border border-dashed border-[var(--border)] bg-[var(--surface)] p-10 text-center">
              <p className="text-xl font-black uppercase tracking-tight">No hay partidos para esta fecha</p>
              <p className="mt-2 text-xs font-bold text-[var(--text-muted)]">Probá con ayer, mañana o una fecha específica.</p>
            </div>
          )}
        </div>

        <aside className="rounded-[1.65rem] border border-[var(--border)] bg-[rgba(5,9,15,.84)] p-4 md:p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.28em] text-[#10b981] flex items-center gap-2"><Users size={13} /> Jugadoras</p>
              <h2 className="mt-1 text-2xl font-black italic uppercase tracking-tighter">Líderes 2026</h2>
            </div>
            <Link href="/wnba/players" className="rounded-xl border border-[var(--border)] px-3 py-2 text-[10px] font-black uppercase tracking-widest hover:border-[#10b981]/45">Ver todas</Link>
          </div>

          <div className="space-y-2">
            {leaders.map((player, index) => <PlayerRow key={player.player_id} player={player} rank={index + 1} />)}
          </div>
        </aside>
      </section>
    </main>
  );
}
