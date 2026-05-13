import PlayerChartContainer from "@/components/PlayerChartContainer";
import TeamMatesPanel from "@/components/TeamMatesPanel";
import { getPlayerData, getTeamPlayers } from "@/lib/api";
import { getPlayerStakeOdds } from "@/lib/playerOdds";
import { ArrowLeft, GitMerge, MousePointer2, Target, Zap } from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

const NAV_STATS = [
  { id: "pts", label: "PTS" },
  { id: "ast", label: "AST" },
  { id: "reb", label: "REB" },
  { id: "pts+ast", label: "PTS+AST" },
  { id: "pts+reb", label: "PTS+REB" },
  { id: "reb+ast", label: "REB+AST" },
  { id: "pts+reb+ast", label: "P+R+A" },
  { id: "fgm", label: "FGM" },
  { id: "fga", label: "FGA" },
  { id: "fg3m", label: "3PTM" },
  { id: "fg3a", label: "3PTA" },
  { id: "blk", label: "BLK" },
  { id: "stl", label: "STL" },
  { id: "stl+blk", label: "STL+BLK" },
  { id: "tov", label: "TO" },
  { id: "pf", label: "PF" },
  { id: "usage_pct", label: "USG%" },
  { id: "touches", label: "TOUCHES" },
];

function normalizeDate(value: any) {
  let fixedDate = value ? String(value) : null;

  if (fixedDate && fixedDate.includes("T")) {
    fixedDate = fixedDate.split("T")[0] + "T12:00:00";
  } else if (fixedDate) {
    fixedDate = fixedDate + "T12:00:00";
  }

  return fixedDate;
}

function normalizeMinutes(s: any) {
  return (
    s?.min ??
    s?.minutes ??
    s?.mins ??
    s?.minutos ??
    s?.minutes_played ??
    s?.mp ??
    null
  );
}

function getSafePlayerName(player: any, stats: any[]) {
  const fromPlayer =
    player?.full_name ||
    `${player?.first_name || ""} ${player?.last_name || ""}`.trim();

  return fromPlayer || stats?.[0]?.player_name || "Jugador";
}

function splitName(player: any, playerName: string) {
  const firstName = player?.first_name || playerName.split(" ")[0] || "Jugador";
  const lastName = player?.last_name || playerName.split(" ").slice(1).join(" ") || "";

  return { firstName, lastName };
}

function formatAvg(value: number | "S/D") {
  return value === "S/D" ? "S/D" : value.toFixed(1);
}

export default async function PlayerPage(props: any) {
  try {
    const params = await Promise.resolve(props.params);
    const playerId = params?.playerId;

    const data = await getPlayerData(playerId);
    if (!data || !data.player) return null;

    const { player, stats } = data;
    const rawStats = Array.isArray(stats) ? stats : [];
    const playerName = getSafePlayerName(player, rawStats);
    const { firstName, lastName } = splitName(player, playerName);

    const cleanStats = rawStats
      .map((s: any) => {
        const minutes = normalizeMinutes(s);

        return {
          ...s,
          game_date: normalizeDate(s.game_date),
          min: minutes,
          minutes,
          usage_pct: Number(s.usage_pct) || 0,
          potential_ast: Number(s.potential_ast || s.pot_ast) || 0,
          rebound_chances: Number(s.rebound_chances) || 0,
          touches: Number(s.touches) || 0,
        };
      })
      .sort(
        (a: any, b: any) =>
          new Date(b.game_date).getTime() - new Date(a.game_date).getTime()
      );

    const teamAbbr =
      cleanStats.find((s: any) => s?.team_abbreviation)?.team_abbreviation ||
      (player as any)?.team_abbreviation ||
      (player as any)?.team ||
      null;

    const [teammates, stakeOdds] = await Promise.all([
      teamAbbr ? getTeamPlayers(String(teamAbbr)) : Promise.resolve([]),
      getPlayerStakeOdds(playerName),
    ]);

    const last5 = cleanStats.slice(0, 5);

    const calcAvg = (key: string): number | "S/D" => {
      if (!last5.length) return 0;

      const sum = last5.reduce(
        (acc: number, curr: any) => acc + (Number(curr[key]) || 0),
        0
      );

      if (
        sum === 0 &&
        ["potential_ast", "rebound_chances", "touches"].includes(key)
      ) {
        return "S/D";
      }

      return sum / last5.length;
    };

    const usageAvg = calcAvg("usage_pct");
    const usageDisplay =
      usageAvg === "S/D" ? "S/D" : `${(usageAvg * 100).toFixed(1)}%`;

    return (
      <main className="min-h-screen bg-[var(--bg)] text-[var(--text)] font-sans pb-20">
        <nav className="border-b border-[var(--border)] bg-[var(--surface)]/95 backdrop-blur-md sticky top-0 z-50 px-6 py-4">
          <Link
            href="/"
            className="text-[var(--text-muted)] hover:text-[#10b981] transition-colors flex items-center gap-2 text-[10px] font-black uppercase tracking-widest"
          >
            <ArrowLeft size={14} /> Volver al Inicio
          </Link>
        </nav>

        <div className="p-4 md:p-8 max-w-[1500px] mx-auto space-y-4">
          <div className="relative bg-[var(--surface)] border border-[var(--border)] rounded-[2.5rem] p-8 md:p-12 overflow-hidden flex flex-col justify-center h-[220px] md:h-[300px] group hover:border-[var(--border-strong)] transition-colors">
            <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-[#10b981] opacity-[0.04] blur-[120px] rounded-full pointer-events-none" />

            <div className="relative z-20 flex items-center justify-between gap-6">
              <div>
                <p className="text-[#10b981] text-[10px] font-black uppercase tracking-[0.4em] mb-3 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[#10b981] animate-pulse" />
                  MoskProps Player Analytics
                </p>

                <h1 className="text-6xl md:text-8xl font-black italic tracking-tighter leading-[0.85] uppercase">
                  {firstName}
                  <br />
                  <span className="text-[#10b981]">{lastName}</span>
                </h1>
              </div>

              <div className="hidden md:flex w-32 h-32 rounded-full border border-[var(--border)] bg-[var(--surface-soft)] items-center justify-center shrink-0 shadow-2xl">
                <span className="font-black text-6xl tracking-tighter text-[var(--text-soft)] group-hover:text-[var(--text-muted)] transition-colors uppercase">
                  {firstName?.charAt(0)}{lastName?.charAt(0)}
                </span>
              </div>
            </div>
          </div>

          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4 flex flex-wrap items-center justify-around gap-6 shadow-xl">
            <div className="flex items-center gap-3">
              <Zap size={18} className="text-[#10b981]" />
              <div>
                <p className="text-[8px] font-black text-[var(--text-muted)] uppercase tracking-widest">
                  Usage Rate
                </p>
                <p className="text-xl font-black italic">{usageDisplay}</p>
              </div>
            </div>

            <div className="w-[1px] h-8 bg-[var(--border)] hidden md:block" />

            <div className="flex items-center gap-3">
              <GitMerge size={18} className="text-blue-500" />
              <div>
                <p className="text-[8px] font-black text-[var(--text-muted)] uppercase tracking-widest">
                  Pot. Asistencias
                </p>
                <p className="text-xl font-black italic">
                  {formatAvg(calcAvg("potential_ast"))}
                </p>
              </div>
            </div>

            <div className="w-[1px] h-8 bg-[var(--border)] hidden md:block" />

            <div className="flex items-center gap-3">
              <Target size={18} className="text-red-500" />
              <div>
                <p className="text-[8px] font-black text-[var(--text-muted)] uppercase tracking-widest">
                  Chances Reb.
                </p>
                <p className="text-xl font-black italic">
                  {formatAvg(calcAvg("rebound_chances"))}
                </p>
              </div>
            </div>

            <div className="w-[1px] h-8 bg-[var(--border)] hidden md:block" />

            <div className="flex items-center gap-3">
              <MousePointer2 size={18} className="text-orange-500" />
              <div>
                <p className="text-[8px] font-black text-[var(--text-muted)] uppercase tracking-widest">
                  Toques de Balón
                </p>
                <p className="text-xl font-black italic">
                  {formatAvg(calcAvg("touches"))}
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-[300px_minmax(0,1fr)] gap-4 items-start">
            <TeamMatesPanel
              teamAbbr={teamAbbr ? String(teamAbbr).toUpperCase() : null}
              players={teammates}
              currentPlayerId={playerId}
            />

            <PlayerChartContainer
              stats={cleanStats}
              navStats={NAV_STATS}
              playerName={playerName}
              stakeOdds={stakeOdds}
            />
          </div>
        </div>
      </main>
    );
  } catch (error: any) {
    console.error("PLAYER_PAGE_ERROR:", error);

    return (
      <div className="min-h-screen bg-[var(--bg)] text-[var(--text)] flex flex-col items-center justify-center p-10 text-center">
        <h1 className="text-red-500 font-black text-3xl mb-4 uppercase tracking-tighter">
          Error al cargar el jugador
        </h1>
        <p className="text-[var(--text-muted)] text-xs font-bold uppercase tracking-widest">
          Intentá de nuevo en unos segundos
        </p>
        <Link
          href="/"
          className="mt-8 border border-[var(--border)] px-6 py-3 rounded-xl uppercase text-xs font-black tracking-widest hover:bg-[var(--surface-hover)] hover:text-[#10b981] transition-all"
        >
          Volver al Inicio
        </Link>
      </div>
    );
  }
}
