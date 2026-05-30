// app/players/[playerId]/page.tsx
import PlayerHeader,      { type PlayerKPI } from "@/components/PlayerHeader";
import SocialRadar                            from "@/components/SocialRadar";
import PlayerPageContent                      from "@/components/PlayerPageContent";
import { getPlayerActiveInjuryContext, getPlayerData, getSchedule, getTeamPlayersForTeams, getTodayScoreboard } from "@/lib/api";
import { getPlayerOddsMultiBook } from "@/lib/playerOdds";
import { getPlayerBioDetails } from "@/lib/playerBio";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

// ─── Nav stats ────────────────────────────────────────────────────────────────

const NAV_STATS = [
  { id: "pts",         label: "PTS"     }, { id: "ast",         label: "AST"     },
  { id: "reb",         label: "REB"     }, { id: "pts+ast",     label: "PTS+AST" },
  { id: "pts+reb",     label: "PTS+REB" }, { id: "reb+ast",     label: "REB+AST" },
  { id: "pts+reb+ast", label: "P+R+A"   }, { id: "fgm",         label: "FGM"     },
  { id: "fga",         label: "FGA"     }, { id: "fg3m",        label: "3PTM"    },
  { id: "fg3a",        label: "3PTA"    }, { id: "blk",         label: "BLK"     },
  { id: "stl",         label: "STL"     }, { id: "stl+blk",     label: "STL+BLK" },
  { id: "tov",         label: "TO"      }, { id: "pf",          label: "PF"      },
];

// ─── SEO ──────────────────────────────────────────────────────────────────────

export async function generateMetadata() {
  return {
    title: "Jugador | MoskProps",
    description: "Análisis de props NBA: hit rates, gráfico histórico, matchup DvP y contexto 5 años.",
    openGraph: {
      title: "Jugador | MoskProps",
      description: "Stats avanzadas, histórico 5 años y DvP para props NBA.",
      type: "website",
    },
  };
}

// ─── Normalization helpers ────────────────────────────────────────────────────

function normalizeDate(v: any) {
  let d = v ? String(v) : null;
  if (d?.includes("T")) d = d.split("T")[0] + "T12:00:00";
  else if (d)            d = d + "T12:00:00";
  return d;
}

function normalizeMinutes(s: any) {
  return s?.min ?? s?.minutes ?? s?.mins ?? s?.minutos ?? s?.minutes_played ?? s?.mp ?? null;
}

const PX = ["q1","h1","h2"] as const;
const PF = ["pts","reb","ast","fgm","fga","fg3m","fg3a","ftm","fta","oreb","dreb","stl","blk","tov","to","pf","pr","pa","ra","pra","stl_blk","3ptm","3pta"] as const;

function first(...vals: any[]) { return vals.find(v => v !== null && v !== undefined && v !== ""); }
function toNum(v: any, fb = 0) { const n = Number(v); return Number.isFinite(n) ? n : fb; }

function normPeriod(s: any) {
  const r = { ...s };
  for (const px of PX) {
    r[`${px}_min`]     = first(r[`${px}_min`],     r[`${px}_min_text`]);
    r[`${px}_minutes`] = first(r[`${px}_minutes`], r[`${px}_min`]);
    r[`${px}_pr`]      = toNum(first(r[`${px}_pr`],  r[`${px}_pts_reb`]), 0);
    r[`${px}_pa`]      = toNum(first(r[`${px}_pa`],  r[`${px}_pts_ast`]), 0);
    r[`${px}_ra`]      = toNum(first(r[`${px}_ra`],  r[`${px}_reb_ast`]), 0);
    r[`${px}_pra`]     = toNum(first(r[`${px}_pra`], r[`${px}_pts_reb_ast`]), 0);
    r[`${px}_to`]      = toNum(first(r[`${px}_to`],  r[`${px}_tov`]), 0);
    r[`${px}_3ptm`]    = toNum(first(r[`${px}_3ptm`],r[`${px}_fg3m`]), 0);
    r[`${px}_3pta`]    = toNum(first(r[`${px}_3pta`],r[`${px}_fg3a`]), 0);
    const stl = toNum(r[`${px}_stl`], 0), blk = toNum(r[`${px}_blk`], 0);
    r[`${px}_stl_blk`] = toNum(first(r[`${px}_stl_blk`], stl + blk), 0);
    for (const f of PF) { const k = `${px}_${f}`; if (r[k] !== undefined) r[k] = toNum(r[k], 0); }
  }
  return r;
}

function safePlayerName(player: any, stats: any[]) {
  const n = player?.full_name || `${player?.first_name||""} ${player?.last_name||""}`.trim();
  return n || stats?.[0]?.player_name || "Jugador";
}

function splitName(player: any, name: string) {
  return {
    firstName: player?.first_name || name.split(" ")[0] || "Jugador",
    lastName:  player?.last_name  || name.split(" ").slice(1).join(" ") || "",
  };
}

function formatAvgVal(v: number | "S/D") {
  return v === "S/D" ? "S/D" : v.toFixed(1);
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default async function PlayerPage(props: any) {
  try {
    const params       = await Promise.resolve(props.params);
    const searchParams = await Promise.resolve(props.searchParams);
    const playerId     = params?.playerId;
    const requestedStat = typeof searchParams?.stat === "string" ? searchParams.stat : "pts";
    const requestedDate = typeof searchParams?.date === "string" ? searchParams.date.slice(0, 10) : null;

    const data = await getPlayerData(playerId);
    if (!data?.player) return null;
    const { player, stats } = data;

    const rawStats   = Array.isArray(stats) ? stats : [];
    const playerName = safePlayerName(player, rawStats);
    const { firstName, lastName } = splitName(player, playerName);

    const cleanStats = rawStats
      .map((s: any) => {
        const row = normPeriod(s);
        const min = normalizeMinutes(row);
        return {
          ...row,
          game_date:       normalizeDate(row.game_date),
          min, minutes:    min,
          // usage_pct: normalizar a decimal (0-1). Si viene como porcentaje (>1) dividir por 100.
          usage_pct:       (() => { const r = Number(row.usage_pct) || 0; return r > 1 ? r / 100 : r; })(),
          potential_ast:   Number(row.potential_ast || row.pot_ast)  || 0,
          rebound_chances: Number(row.rebound_chances)               || 0,
          touches:         Number(row.touches)                       || 0,
        };
      })
      .sort((a: any, b: any) =>
        new Date(b.game_date).getTime() - new Date(a.game_date).getTime()
      );

    const teamAbbr =
      cleanStats.find((s: any) => s?.team_abbreviation)?.team_abbreviation ||
      (player as any)?.team_abbreviation || (player as any)?.team || null;

    const games = await getSchedule();
    const normalizedTeamAbbr = teamAbbr ? String(teamAbbr).toUpperCase() : null;
    const teamGames = normalizedTeamAbbr
      ? games.filter((g) => g.teams.map((t) => t.toUpperCase()).includes(normalizedTeamAbbr))
      : games;

    const rosterTeams = Array.from(new Set([
      ...(normalizedTeamAbbr ? [normalizedTeamAbbr] : []),
      ...teamGames.flatMap((g) => g.teams.map((t) => t.toUpperCase())),
    ])).filter(Boolean);

    // ── Parallel fetches ──────────────────────────────────────────────────────
    const [teammates, stakeOdds, scoreboard, bioDetails] = await Promise.all([
      rosterTeams.length > 0
        ? getTeamPlayersForTeams(rosterTeams, { stat: requestedStat, book: "stake" })
        : Promise.resolve([]),
      getPlayerOddsMultiBook(playerName),
      getTodayScoreboard(),
      getPlayerBioDetails(playerId, playerName),
    ]);

    // ── Próximo partido desde ESPN ────────────────────────────────────────────
    const nextGameEvent = (scoreboard as any[]).find((ev: any) => {
      const comps = ev?.competitions?.[0]?.competitors ?? [];
      return comps.some((t: any) =>
        t?.team?.abbreviation?.toUpperCase() === String(teamAbbr || "").toUpperCase()
      );
    });

    const nextGame = nextGameEvent ? (() => {
      const comps  = nextGameEvent.competitions[0].competitors as any[];
      const home   = comps.find((t: any) => t.homeAway === "home");
      const away   = comps.find((t: any) => t.homeAway === "away");
      const isHome = home?.team?.abbreviation?.toUpperCase() === String(teamAbbr || "").toUpperCase();
      const opp    = isHome ? away : home;
      return {
        opponent: opp?.team?.abbreviation ?? "???",
        isHome,
        date:     nextGameEvent.date ?? "",
        time:     nextGameEvent.date
          ? new Date(nextGameEvent.date)
              .toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Argentina/Buenos_Aires" })
              .replace(/[\u00A0\u202F]/g, " ")
          : undefined,
      };
    })() : undefined;

    const todayArgDate = new Date().toISOString().slice(0, 10);
    const activeInjuryContextDate =
      requestedDate || (nextGame?.date ? String(nextGame.date).slice(0, 10) : todayArgDate);

    const activeInjuryContext = await getPlayerActiveInjuryContext(
      Number(playerId),
      activeInjuryContextDate,
    );

    // Último rival (para DvP)
    const lastOpponent =
      cleanStats[0]?.opponent_abbr ??
      cleanStats[0]?.matchup?.split(" ").pop() ??
      null;

    // ── KPIs con tendencia L5 vs L10 ─────────────────────────────────────────
    const last5  = cleanStats.slice(0, 5);
    const last10 = cleanStats.slice(0, 10);

    const avgRange = (key: string, r: any[]) =>
      r.length ? r.reduce((a: number, c: any) => a + (Number(c[key]) || 0), 0) / r.length : 0;

    const calcAvg = (key: string): number | "S/D" => {
      if (!last5.length) return 0;
      const sum = last5.reduce((a: number, c: any) => a + (Number(c[key]) || 0), 0);
      if (sum === 0 && ["potential_ast","rebound_chances","touches"].includes(key)) return "S/D";
      return sum / last5.length;
    };

    const delta = (key: string, mul = 1) =>
      parseFloat(((avgRange(key, last5) - avgRange(key, last10)) * mul).toFixed(1));

    const usageAvg     = calcAvg("usage_pct");
    const usageDisplay = usageAvg === "S/D" ? "S/D" : `${(Number(usageAvg) * 100).toFixed(1)}%`;
    const position     = bioDetails?.position || (player as any)?.position || null;

    const kpis: PlayerKPI[] = [
      { label: "Usage Rate",       value: usageDisplay,                        trend: usageAvg === "S/D" ? 0 : delta("usage_pct", 100), trendLabel: "vs L10" },
      { label: "Pot. Asistencias", value: formatAvgVal(calcAvg("potential_ast")),    trend: calcAvg("potential_ast")   === "S/D" ? undefined : delta("potential_ast"),   trendLabel: "vs L10" },
      { label: "Chances Reb.",     value: formatAvgVal(calcAvg("rebound_chances")),  trend: calcAvg("rebound_chances") === "S/D" ? undefined : delta("rebound_chances"), trendLabel: "vs L10" },
      { label: "Toques",           value: formatAvgVal(calcAvg("touches")),          trend: calcAvg("touches")         === "S/D" ? undefined : delta("touches"),         trendLabel: "vs L10" },
    ];

    return (
      <main className="min-h-screen bg-[var(--bg)] text-[var(--text)] font-sans pb-20">
        <nav className="border-b border-[var(--border)] bg-[var(--surface)]/95 backdrop-blur-md sticky top-0 z-50 px-6 py-4">
          <Link href="/" className="text-[var(--text-muted)] hover:text-[#10b981] transition-colors flex items-center gap-2 text-[10px] font-black uppercase tracking-widest">
            <ArrowLeft size={14} /> Volver al Inicio
          </Link>
        </nav>

        <div className="p-4 md:p-6 2xl:p-8 max-w-[1700px] mx-auto space-y-4">

          {/* Header del jugador */}
          <PlayerHeader
            playerName={playerName}
            teamAbbr={teamAbbr ? String(teamAbbr).toUpperCase() : undefined}
            position={position ?? undefined}
            initials={`${firstName?.charAt(0) ?? ""}${lastName?.charAt(0) ?? ""}`}
            imageUrl={bioDetails?.imageUrl ?? (player as any)?.image_url ?? undefined}
            bio={bioDetails}
            kpis={kpis}
            nextGame={nextGame}
          />

          {/* Social radar — se oculta si no hay datos */}
          <SocialRadar playerName={playerName} />

          {/* Grid sidebar + gráfico — maneja selectedGame en client */}
          <PlayerPageContent
            stats={cleanStats}
            navStats={NAV_STATS}
            playerName={playerName}
            stakeOdds={stakeOdds}
            teammates={teammates}
            teamAbbr={teamAbbr ? String(teamAbbr).toUpperCase() : null}
            currentPlayerId={String(playerId)}
            games={teamGames.length > 0 ? teamGames : games}
            position={position ?? undefined}
            lastOpponent={lastOpponent ?? undefined}
            nextOpponent={nextGame?.opponent ?? undefined}
            nextHomeAway={nextGame ? (nextGame.isHome ? "HOME" : "AWAY") : undefined}
            nextGameDate={activeInjuryContextDate ?? undefined}
            activeInjuryContext={activeInjuryContext}
          />

        </div>
      </main>
    );

  } catch (error: any) {
    console.error("PLAYER_PAGE_ERROR:", error);
    return (
      <div className="min-h-screen bg-[var(--bg)] text-[var(--text)] flex flex-col items-center justify-center p-10 text-center">
        <h1 className="text-red-500 font-black text-3xl mb-4 uppercase tracking-tighter">Error al cargar el jugador</h1>
        <p className="text-[var(--text-muted)] text-xs font-bold uppercase tracking-widest">Intentá de nuevo en unos segundos</p>
        <Link href="/" className="mt-8 border border-[var(--border)] px-6 py-3 rounded-xl uppercase text-xs font-black tracking-widest hover:bg-[var(--surface-hover)] hover:text-[#10b981] transition-all">
          Volver al Inicio
        </Link>
      </div>
    );
  }
}
