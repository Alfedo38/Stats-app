"use client";

import { useEffect, useMemo, useState, useRef, type ReactNode } from "react";
import { Calculator, ChevronDown, ChevronLeft, ChevronRight, Crosshair, Shield, Target } from "lucide-react";
import type { AnalysisSample } from "@/lib/nbaAnalysis";
import { keyGame } from "@/lib/nbaAnalysis";
import {analysisStyles} from "@/components/AnalysisAccordion";
import NBAProInsights from "@/components/NBAProInsights";
import DvpPanel from "@/components/DvpPanel";

type Shot = {
  game_id: string; game_event_id: number; game_date: string; season_type: string;
  team_abbr?: string | null; opponent_abbr?: string | null; period?: number | null;
  minutes_remaining?: number | null; seconds_remaining?: number | null;
  action_type?: string | null; shot_type?: string | null; shot_zone_basic?: string | null;
  shot_distance?: number | null; loc_x?: number | null; loc_y?: number | null;
  shot_made_flag?: number | null; home_team_abbr?: string | null; away_team_abbr?: string | null;
};

type Matchup = {
  game_id: string; game_date: string; season_type: string;
  offensive_team_abbr?: string | null; defensive_team_abbr?: string | null;
  defensive_player_id: number; defensive_player_name: string;
  defensive_position?: string | null; matchup_minutes?: string | null;
  matchup_minutes_sort?: number | null; partial_possessions?: number | null;
  percentage_offensive_total_time?: number | null; player_points?: number | null;
  matchup_assists?: number | null; matchup_turnovers?: number | null;
  matchup_field_goals_made?: number | null; matchup_field_goals_attempted?: number | null;
  matchup_three_pointers_made?: number | null; matchup_three_pointers_attempted?: number | null;
};

type GameLog = {
  game_id: string; game_date: string; season_type?: string | null;
  team_abbreviation?: string | null; opponent_abbr?: string | null;
  matchup?: string | null; home_away?: string | null; wl?: string | null;
  pts?: number | null; fgm?: number | null; fga?: number | null;
  reb?: number | null; ast?: number | null; tov?: number | null;
  fg3m?: number | null; fg3a?: number | null; min?: number | null;
  fta?: number | null; season?: string;
  usage_pct?: number | null; touches?: number | null; rebound_chances?: number | null;
  potential_ast?: number | null; passes_made?: number | null;
};

type DefenderFoul = {
  player_id: number; games: number; pf_avg: number;
};

type DefenderTotal = {
  id: number; name: string; position: string; games: Set<string>; possessions: number;
  seconds: number; points: number; fgm: number; fga: number; fg3m: number; fg3a: number;
  turnovers: number; assists: number;
};

const RANGE_OPTIONS = [5, 10, 20, 0] as const;
const POSITION_OPTIONS = ["ALL", "G", "F", "C"] as const;
const NBA_TEAM_OPTIONS = [
  "ATL", "BOS", "BKN", "CHA", "CHI", "CLE", "DAL", "DEN", "DET", "GSW",
  "HOU", "IND", "LAC", "LAL", "MEM", "MIA", "MIL", "MIN", "NOP", "NYK",
  "OKC", "ORL", "PHI", "PHX", "POR", "SAC", "SAS", "TOR", "UTA", "WAS",
] as const;

type MarketKey = "pts" | "reb" | "ast" | "pra" | "pr" | "pa" | "ra" | "fga" | "fgm" | "fg3m";

const MARKET_OPTIONS: { id: MarketKey; label: string; detail: string }[] = [
  { id: "pts", label: "PTS", detail: "Puntos" },
  { id: "reb", label: "REB", detail: "Rebotes" },
  { id: "ast", label: "AST", detail: "Asistencias" },
  { id: "pra", label: "PRA", detail: "Puntos + rebotes + asistencias" },
  { id: "pr", label: "RP", detail: "Rebotes + puntos" },
  { id: "pa", label: "AP", detail: "Asistencias + puntos" },
  { id: "ra", label: "RA", detail: "Rebotes + asistencias" },
  { id: "fga", label: "FGA", detail: "Tiros intentados" },
  { id: "fgm", label: "FGM", detail: "Tiros convertidos" },
  { id: "fg3m", label: "3PM", detail: "Triples convertidos" },
];

function n(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function marketValue(game: GameLog, market: MarketKey): number {
  const pts = n(game.pts);
  const reb = n(game.reb);
  const ast = n(game.ast);
  if (market === "pra") return pts + reb + ast;
  if (market === "pr") return pts + reb;
  if (market === "pa") return pts + ast;
  if (market === "ra") return reb + ast;
  return n(game[market]);
}

function mean(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function dateOnly(value: string | null | undefined): string {
  return String(value || "").slice(0, 10);
}

function dateLabel(value: string): string {
  if (!value) return "Fecha sin datos";
  return new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${dateOnly(value)}T12:00:00Z`));
}

function positionGroup(raw: string | null | undefined): "G" | "F" | "C" | "S/D" {
  const value = String(raw || "").toUpperCase().replace(/\s/g, "");
  if (!value) return "S/D";
  if (value === "C" || value.startsWith("C-")) return "C";
  if (value.includes("PG") || value.includes("SG") || value === "G" || value.startsWith("G-")) return "G";
  if (value.includes("PF") || value.includes("SF") || value === "F" || value.startsWith("F-")) return "F";
  if (value.includes("C")) return "C";
  if (value.includes("G")) return "G";
  if (value.includes("F")) return "F";
  return "S/D";
}

function mmss(seconds: number): string {
  const safe = Math.max(0, Math.round(seconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}

function pct(made: number, attempted: number): string {
  return attempted > 0 ? `${((made / attempted) * 100).toFixed(1)}%` : "—";
}

function parseOpponent(matchup: string | null | undefined, team: string | null | undefined): string {
  const raw = String(matchup || "").toUpperCase();
  const own = String(team || "").toUpperCase();
  const parts = raw.includes(" VS. ") ? raw.split(" VS. ") : raw.includes(" @ ") ? raw.split(" @ ") : [];
  return parts.find((part) => part.trim() !== own)?.trim() || "";
}

function buildDefenderTotals(rows: Matchup[]): DefenderTotal[] {
  const totals = new Map<number, DefenderTotal>();
  for (const row of rows) {
    const id = n(row.defensive_player_id);
    const current = totals.get(id) || {
      id, name: row.defensive_player_name || "Defensor", position: positionGroup(row.defensive_position),
      games: new Set<string>(), possessions: 0, seconds: 0, points: 0, fgm: 0, fga: 0,
      fg3m: 0, fg3a: 0, turnovers: 0, assists: 0,
    };
    current.games.add(String(row.game_id));
    current.possessions += n(row.partial_possessions);
    current.seconds += n(row.matchup_minutes_sort);
    current.points += n(row.player_points);
    current.fgm += n(row.matchup_field_goals_made);
    current.fga += n(row.matchup_field_goals_attempted);
    current.fg3m += n(row.matchup_three_pointers_made);
    current.fg3a += n(row.matchup_three_pointers_attempted);
    current.turnovers += n(row.matchup_turnovers);
    current.assists += n(row.matchup_assists);
    totals.set(id, current);
  }
  return [...totals.values()].sort((a, b) => b.possessions - a.possessions);
}

function FilterButton({ active, children, onClick }: { active: boolean; children: ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={`rounded-lg border px-3 py-2 text-[10px] font-black uppercase tracking-wider transition ${active ? "border-cyan-400 bg-cyan-400/15 text-cyan-300" : "border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] hover:text-[var(--text)]"}`}>
      {children}
    </button>
  );
}

function CollapsibleSection({ title, meta, icon, defaultOpen = true, children }: {
  title: string; meta?: string; icon: ReactNode; defaultOpen?: boolean; children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className={analysisStyles.box}>
      <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open}
        className={analysisStyles.trigger}>
        <span className={analysisStyles.heading}>
          <span className={analysisStyles.icon}>{icon}</span>
          <span className={analysisStyles.title}>{title}</span>
          {meta && <span className="truncate text-[10px] text-[var(--text-muted)]">{meta}</span>}
        </span>
        <ChevronDown size={16} className={analysisStyles.chevron} style={{transform:open?"rotate(180deg)":undefined}} />
      </button>
      {open && <div className={analysisStyles.body}>{children}</div>}
    </section>
  );
}

function DefenderTable({ rows, compact = false }: { rows: Matchup[]; compact?: boolean }) {
  const defenders = useMemo(() => buildDefenderTotals(rows), [rows]);
  const [showAll, setShowAll] = useState(false);
  if (!defenders.length) return <p className="px-4 py-5 text-xs text-[var(--text-muted)]">Sin emparejamientos para este filtro.</p>;
  const visibleDefenders = compact && !showAll ? defenders.slice(0, 3) : defenders;
  return (
    <div>
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-left text-xs">
        <thead className="border-b border-[var(--border)] text-[9px] uppercase tracking-widest text-[var(--text-muted)]">
          <tr><th className="px-4 py-3">Defensor</th><th>Pos.</th><th>Partidos</th><th>Tiempo</th><th>Poses.</th><th>PTS</th><th>TC</th><th>3PT</th><th>AST</th><th>TO</th></tr>
        </thead>
        <tbody className="divide-y divide-[var(--border)]">
          {visibleDefenders.map((item, index) => (
            <tr key={item.id} className="hover:bg-white/[0.025]">
              <td className="px-4 py-3 font-bold text-[var(--text)]">{item.name}{index === 0 && <span className="ml-2 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2 py-0.5 text-[8px] font-black uppercase text-emerald-300">Principal</span>}</td>
              <td><span className="rounded-md bg-white/5 px-2 py-1 font-black text-emerald-300">{item.position}</span></td>
              <td>{item.games.size}</td><td>{mmss(item.seconds)}</td><td>{item.possessions.toFixed(1)}</td><td>{item.points.toFixed(0)}</td>
              <td>{item.fgm.toFixed(0)}/{item.fga.toFixed(0)} <span className="text-[var(--text-muted)]">({pct(item.fgm, item.fga)})</span></td>
              <td>{item.fg3m.toFixed(0)}/{item.fg3a.toFixed(0)}</td><td>{item.assists.toFixed(0)}</td><td>{item.turnovers.toFixed(0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    {compact && defenders.length > 3 && <button type="button" onClick={() => setShowAll((value) => !value)} className="m-3 rounded-lg border border-[var(--border)] px-3 py-2 text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)] hover:text-[var(--text)]">{showAll ? "Ver principales" : `Ver todos (${defenders.length})`}</button>}
    </div>
  );
}

function ShotCourt({ shots }: { shots: Shot[] }) {
  const [selected, setSelected] = useState<Shot | null>(null);
  const [courtView, setCourtView] = useState<"shots" | "zones">("shots");
  const made = shots.filter((shot) => n(shot.shot_made_flag) === 1).length;
  const plotted = shots.filter((shot) => Number.isFinite(Number(shot.loc_x)) && Number.isFinite(Number(shot.loc_y)));
  const zones = useMemo(() => {
    const grouped = new Map<string, { made: number; attempts: number; x: number; y: number }>();
    for (const shot of shots) {
      const zone = String(shot.shot_zone_basic || "Sin zona");
      const current = grouped.get(zone) || { made: 0, attempts: 0, x: 0, y: 0 };
      current.attempts += 1;
      current.made += n(shot.shot_made_flag) === 1 ? 1 : 0;
      current.x += n(shot.loc_x);
      current.y += n(shot.loc_y);
      grouped.set(zone, current);
    }
    return [...grouped.entries()].sort((a, b) => b[1].attempts - a[1].attempts).slice(0, 4);
  }, [shots]);

  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(280px,480px)_minmax(180px,1fr)]">
      <div className="mx-auto w-full max-w-[480px]">
        <div className="mb-2 grid grid-cols-2 gap-1 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-1">
          <button type="button" onClick={() => setCourtView("shots")} className={`rounded-lg px-3 py-2 text-[9px] font-black uppercase tracking-widest ${courtView === "shots" ? "bg-emerald-400 text-black" : "text-[var(--text-muted)]"}`}>Ubicación</button>
          <button type="button" onClick={() => setCourtView("zones")} className={`rounded-lg px-3 py-2 text-[9px] font-black uppercase tracking-widest ${courtView === "zones" ? "bg-cyan-300 text-slate-950" : "text-[var(--text-muted)]"}`}>Porcentaje</button>
        </div>
        <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[#081613] p-2">
        <svg viewBox="0 0 500 470" className="block h-auto w-full" aria-label="Mapa de tiros con el aro en la parte superior">
          <rect x="1" y="1" width="498" height="468" fill="#0a1c18" stroke="#36534b" strokeWidth="2" />
          <path d="M30 0 V140 M470 0 V140 M30 140 A237.5 237.5 0 0 0 470 140" fill="none" stroke="#55766d" strokeWidth="2" />
          <rect x="170" y="1" width="160" height="189" fill="none" stroke="#55766d" strokeWidth="2" />
          <circle cx="250" cy="190" r="60" fill="none" stroke="#55766d" strokeWidth="2" strokeDasharray="5 4" />
          <path d="M210 52.5 A40 40 0 0 0 290 52.5" fill="none" stroke="#55766d" strokeWidth="2" />
          <line x1="220" y1="40" x2="280" y2="40" stroke="#d7e4df" strokeWidth="4" />
          <circle cx="250" cy="52.5" r="8" fill="none" stroke="#f97316" strokeWidth="4" />
          <line x1="1" y1="469" x2="499" y2="469" stroke="#55766d" strokeWidth="2" />
          {courtView === "shots" && plotted.map((shot) => {
            const x = Math.min(495, Math.max(5, 250 + n(shot.loc_x)));
            const y = Math.min(465, Math.max(5, 52.5 + n(shot.loc_y)));
            const success = n(shot.shot_made_flag) === 1;
            return (
              <circle key={`${shot.game_id}-${shot.game_event_id}`} cx={x} cy={y} r={selected?.game_event_id === shot.game_event_id ? 8 : 5.5}
                fill={success ? "#34d399" : "#fb7185"} stroke={selected?.game_event_id === shot.game_event_id ? "white" : "#07120f"} strokeWidth="2"
                className="cursor-pointer transition-all hover:opacity-80" onClick={() => setSelected(shot)}>
                <title>{success ? "Convertido" : "Fallado"} · {shot.action_type || shot.shot_type || "Tiro"}</title>
              </circle>
            );
          })}
          {courtView === "zones" && zones.map(([zone, total]) => {
            const x = Math.min(445, Math.max(55, 250 + total.x / Math.max(total.attempts, 1)));
            const y = Math.min(420, Math.max(85, 52.5 + total.y / Math.max(total.attempts, 1)));
            const percentage = total.attempts > 0 ? total.made / total.attempts : 0;
            const color = percentage >= 0.55 ? "#34d399" : percentage >= 0.4 ? "#22d3ee" : "#fb7185";
            const radius = Math.min(42, 21 + total.attempts * 1.2);
            return <g key={zone}><circle cx={x} cy={y} r={radius} fill={color} fillOpacity="0.22" stroke={color} strokeWidth="2" /><text x={x} y={y - 3} textAnchor="middle" fill="white" fontSize="13" fontWeight="900">{pct(total.made, total.attempts)}</text><text x={x} y={y + 14} textAnchor="middle" fill={color} fontSize="10" fontWeight="800">{total.made}/{total.attempts}</text></g>;
          })}
        </svg>
        </div>
      </div>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3"><div className="text-[9px] font-black uppercase text-[var(--text-muted)]">Tiros</div><div className="mt-1 text-xl font-black">{shots.length}</div></div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3"><div className="text-[9px] font-black uppercase text-[var(--text-muted)]">TC</div><div className="mt-1 text-xl font-black">{made}/{shots.length} <span className="text-xs text-emerald-300">{pct(made, shots.length)}</span></div></div>
        </div>
        <div className="flex flex-wrap gap-3 text-[10px] font-bold uppercase text-[var(--text-muted)]">{courtView === "shots" ? <><span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-full bg-emerald-400" />Convertido</span><span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-full bg-rose-400" />Fallado</span></> : <><span className="text-emerald-300">≥55% fuerte</span><span className="text-cyan-300">40–54%</span><span className="text-rose-300">&lt;40%</span></>}</div>
        {!!zones.length && <div className="space-y-1.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3"><div className="text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)]">Eficiencia por zona</div>{zones.map(([zone, total]) => <div key={zone} className="flex items-center justify-between gap-3 text-[10px]"><span className="truncate text-[var(--text-muted)]">{zone}</span><span className="shrink-0 font-black text-[var(--text)]">{total.made}/{total.attempts} · {pct(total.made, total.attempts)}</span></div>)}</div>}
        <div className="min-h-32 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
          {selected ? <>
            <div className={`text-xs font-black uppercase ${n(selected.shot_made_flag) === 1 ? "text-emerald-300" : "text-rose-300"}`}>{n(selected.shot_made_flag) === 1 ? "Convertido" : "Fallado"}</div>
            <div className="mt-2 font-bold">{selected.action_type || selected.shot_type || "Tiro"}</div>
            <div className="mt-2 text-xs leading-5 text-[var(--text-muted)]">Q{selected.period || "—"} · {String(selected.minutes_remaining ?? "—")}:{String(selected.seconds_remaining ?? 0).padStart(2, "0")}<br />{selected.shot_zone_basic || "Zona sin datos"} · {selected.shot_distance ?? "—"} pies</div>
          </> : <p className="text-xs leading-5 text-[var(--text-muted)]">Seleccioná un punto para ver el cuarto, el reloj, la zona y la distancia.</p>}
        </div>
      </div>
    </div>
  );
}

type NBAContextExplorerProps = {
  playerId: string;
  playerName: string;
  opponentAbbr?: string | null;
  playerPosition?: string | null;
  dvpKey?: string;
  nextGameDate?: string | null;
  sharedSample?: AnalysisSample | null;
};

export default function NBAContextExplorer({
  playerId,
  playerName,
  opponentAbbr,
  playerPosition,
  dvpKey,
  nextGameDate,
  sharedSample,
}: NBAContextExplorerProps) {
  const [shots, setShots] = useState<Shot[]>([]);
  const [matchups, setMatchups] = useState<Matchup[]>([]);
  const [gameLogs, setGameLogs] = useState<GameLog[]>([]);
  const [defenderFouls, setDefenderFouls] = useState<DefenderFoul[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const autoSeason = useRef(true);
  const [availableSeasons, setAvailableSeasons] = useState<string[]>([]);
  const [selectedSeason, setSelectedSeason] = useState("2025-26");
  const [seasonType, setSeasonType] = useState("ALL");
  useEffect(()=>{if(sharedSample?.phase)setSeasonType(sharedSample.phase);},[sharedSample?.phase]);
  const [opponent, setOpponent] = useState(() => String(opponentAbbr || "ALL").trim().toUpperCase() || "ALL");
  const [position, setPosition] = useState("ALL");
  const [range, setRange] = useState<number>(5);
  const [selectedGameId, setSelectedGameId] = useState("");
  const [selectedMarket, setSelectedMarket] = useState<MarketKey>("pts");
  const [marketLine, setMarketLine] = useState(0);

  useEffect(() => {
    const saved = window.localStorage.getItem("nba-context-expanded");
    setExpanded(saved === null ? true : saved === "1");
  }, []);

  useEffect(() => {
    if (!expanded) return;
    const controller = new AbortController();
    setLoading(true); setLoaded(false); setError("");
    setShots([]); setMatchups([]); setGameLogs([]); setDefenderFouls([]);
    setSelectedGameId("");
    fetch(`/api/nba-context?playerId=${encodeURIComponent(playerId)}&season=${encodeURIComponent(selectedSeason)}`, { signal: controller.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok || !data?.ok) throw new Error(data?.error || "No se pudo cargar el contexto NBA");
        if (controller.signal.aborted) return;
        const seasons: string[] = Array.isArray(data.availableSeasons) ? data.availableSeasons.filter((value: string) => /^\d{4}-\d{2}$/.test(value)) : [];
        setAvailableSeasons(seasons);
        if (autoSeason.current) {
          autoSeason.current = false;
          if (!data.games?.length && seasons.length && !seasons.includes(selectedSeason)) { setSelectedSeason(seasons[0]); return; }
        }
        setShots(Array.isArray(data.shots) ? data.shots : []);
        setMatchups(Array.isArray(data.matchups) ? data.matchups : []);
        setGameLogs(Array.isArray(data.games) ? data.games : []);
        setDefenderFouls(Array.isArray(data.defenderFouls) ? data.defenderFouls : []);
        setLoaded(true);
      })
      .catch((reason) => { if (!controller.signal.aborted) setError(reason?.message || "No se pudo cargar el contexto NBA"); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [expanded, playerId, selectedSeason]);

  function toggleExpanded() {
    setExpanded((current) => {
      const next = !current;
      window.localStorage.setItem("nba-context-expanded", next ? "1" : "0");
      return next;
    });
  }

  const gameMeta = useMemo(() => {
    const map = new Map<string, { id: string; date: string; seasonType: string; opponent: string; log?: GameLog }>();
    for (const log of gameLogs) map.set(String(log.game_id), { id: String(log.game_id), date: dateOnly(log.game_date), seasonType: String(log.season_type || ""), opponent: String(log.opponent_abbr || parseOpponent(log.matchup, log.team_abbreviation)).toUpperCase(), log });
    for (const shot of shots) {
      const id = String(shot.game_id); const previous = map.get(id);
      map.set(id, { id, date: dateOnly(shot.game_date) || previous?.date || "", seasonType: shot.season_type || previous?.seasonType || "", opponent: String(shot.opponent_abbr || previous?.opponent || "").toUpperCase(), log: previous?.log });
    }
    for (const row of matchups) {
      const id = String(row.game_id); const previous = map.get(id);
      map.set(id, { id, date: dateOnly(row.game_date) || previous?.date || "", seasonType: row.season_type || previous?.seasonType || "", opponent: String(row.defensive_team_abbr || previous?.opponent || "").toUpperCase(), log: previous?.log });
    }
    return map;
  }, [gameLogs, matchups, shots]);

  const filteredGames = useMemo(() => {
    const sharedIds = sharedSample ? new Set(sharedSample.rows.map(keyGame)) : null;
    const list = [...gameMeta.values()].filter(game => !sharedIds || sharedIds.has(String(game.id).replace(/^0+/, ""))).filter((game) => (seasonType === "ALL" || game.seasonType === seasonType) && (opponent === "ALL" || game.opponent === opponent)).sort((a, b) => b.date.localeCompare(a.date));
    return range > 0 ? list.slice(0, range) : list;
  }, [gameMeta, opponent, range, seasonType, sharedSample]);

  useEffect(() => {
    if (!filteredGames.some((game) => game.id === selectedGameId)) setSelectedGameId(filteredGames[0]?.id || "");
  }, [filteredGames, selectedGameId]);

  const allowedIds = useMemo(() => new Set(filteredGames.map((game) => game.id)), [filteredGames]);
  const rangeMatchups = useMemo(() => matchups.filter((row) => allowedIds.has(String(row.game_id)) && (position === "ALL" || positionGroup(row.defensive_position) === position)), [allowedIds, matchups, position]);
  const selectedGame = filteredGames.find((game) => game.id === selectedGameId);
  const selectedIndex = filteredGames.findIndex((game) => game.id === selectedGameId);
  const selectedShots = shots.filter((shot) => String(shot.game_id) === selectedGameId);
  const selectedMatchups = rangeMatchups.filter((row) => String(row.game_id) === selectedGameId);

  const teamGroups = useMemo(() => {
    const map = new Map<string, Matchup[]>();
    for (const row of rangeMatchups) {
      const team = String(row.defensive_team_abbr || "S/D").toUpperCase();
      const current = map.get(team) || []; current.push(row); map.set(team, current);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [rangeMatchups]);

  const projection = useMemo(() => {
    if (opponent === "ALL" || !filteredGames.length) return null;

    const gameValues = filteredGames.map((game) => {
      const gameShots = shots.filter((shot) => String(shot.game_id) === game.id);
      const logFga = game.log?.fga;
      const logFgm = game.log?.fgm;
      return {
        fga: logFga !== null && logFga !== undefined ? n(logFga) : gameShots.length,
        fgm: logFgm !== null && logFgm !== undefined
          ? n(logFgm)
          : gameShots.filter((shot) => n(shot.shot_made_flag) === 1).length,
        minutes: n(game.log?.min),
      };
    }).filter((game) => game.fga > 0);
    if (!gameValues.length) return null;

    const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);
    const fgaMean = mean(gameValues.map((game) => game.fga));
    const minutesValues = gameValues.map((game) => game.minutes).filter((value) => value > 0);
    const minutesMean = minutesValues.length ? mean(minutesValues) : null;
    const totalActualFga = gameValues.reduce((sum, game) => sum + game.fga, 0);
    const totalActualFgm = gameValues.reduce((sum, game) => sum + game.fgm, 0);
    const baselinePct = totalActualFga > 0 ? totalActualFgm / totalActualFga : 0;
    const variance = mean(gameValues.map((game) => (game.fga - fgaMean) ** 2));
    const deviation = Math.sqrt(variance);

    const defenders = buildDefenderTotals(rangeMatchups).filter((defender) => defender.possessions > 0);
    const totalPossessions = defenders.reduce((sum, defender) => sum + defender.possessions, 0);
    const matchupFga = defenders.reduce((sum, defender) => sum + defender.fga, 0);
    const baseAttemptRate = totalPossessions > 0 ? matchupFga / totalPossessions : 0;
    const priorPossessions = 12;
    const priorAttempts = 8;
    const modeled = defenders.map((defender) => ({
      defender,
      weight: defender.possessions / Math.max(totalPossessions, 1),
      attemptRate: (defender.fga + priorPossessions * baseAttemptRate) / (defender.possessions + priorPossessions),
      makePct: (defender.fgm + priorAttempts * baselinePct) / (defender.fga + priorAttempts),
    }));
    const normalRate = modeled.reduce((sum, item) => sum + item.weight * item.attemptRate, 0);
    const normalPct = modeled.length
      ? modeled.reduce((sum, item) => sum + item.weight * item.makePct, 0)
      : baselinePct;

    const primary = modeled[0];
    const foul = defenderFouls.find((item) => n(item.player_id) === primary?.defender.id);
    const pfAverage = foul ? n(foul.pf_avg) : null;
    const removedShare = Math.min(0.45, Math.max(0.30, 0.30 + Math.max(0, n(pfAverage) - 2.5) * 0.05));
    const otherWeight = Math.max(0, 1 - n(primary?.weight));
    const otherRate = otherWeight > 0
      ? modeled.slice(1).reduce((sum, item) => sum + item.weight * item.attemptRate, 0) / otherWeight
      : normalRate * 1.04;
    const otherPct = otherWeight > 0
      ? modeled.slice(1).reduce((sum, item) => sum + item.weight * item.makePct, 0) / otherWeight
      : Math.min(1, normalPct + 0.015);
    const foulRate = primary
      ? normalRate + primary.weight * removedShare * (otherRate - primary.attemptRate)
      : normalRate;
    const foulPct = primary
      ? normalPct + primary.weight * removedShare * (otherPct - primary.makePct)
      : normalPct;
    const foulFga = normalRate > 0 ? fgaMean * (foulRate / normalRate) : fgaMean;
    const margin = Math.max(1.5, deviation, Math.sqrt(fgaMean) * 0.65);
    const confidence = filteredGames.length >= 5 && totalPossessions >= 100
      ? "Alta"
      : filteredGames.length >= 3 && totalPossessions >= 50 ? "Media" : "Baja";

    return {
      games: gameValues.length,
      possessions: totalPossessions,
      fga: fgaMean,
      fgm: fgaMean * normalPct,
      fgPct: normalPct,
      low: Math.max(0, Math.floor(fgaMean - margin)),
      high: Math.ceil(fgaMean + margin),
      minutes: minutesMean,
      confidence,
      primary: primary?.defender,
      primaryShare: primary ? primary.weight : 0,
      pfAverage,
      foulFga,
      foulFgm: foulFga * foulPct,
      foulPct,
    };
  }, [defenderFouls, filteredGames, opponent, rangeMatchups, shots]);

  const marketProjection = useMemo(() => {
    const scoped = gameLogs
      .filter((game) => seasonType === "ALL" || game.season_type === seasonType)
      .sort((a, b) => dateOnly(b.game_date).localeCompare(dateOnly(a.game_date)));
    const recent = range > 0 ? scoped.slice(0, range) : scoped;
    const rivalGames = opponent === "ALL"
      ? []
      : scoped.filter((game) => String(game.opponent_abbr || parseOpponent(game.matchup, game.team_abbreviation)).toUpperCase() === opponent).slice(0, range > 0 ? range : undefined);
    const seasonValues = scoped.map((game) => marketValue(game, selectedMarket));
    const recentValues = recent.map((game) => marketValue(game, selectedMarket));
    const rivalValues = rivalGames.map((game) => marketValue(game, selectedMarket));
    if (!seasonValues.length || !recentValues.length) return null;

    const seasonMean = mean(seasonValues);
    const recentMean = mean(recentValues);
    const rivalMean = mean(rivalValues);
    const rivalWeight = rivalValues.length ? Math.min(0.25, rivalValues.length * 0.05) : 0;
    const recentWeight = range === 0 ? 0.5 : 0.6;
    const seasonWeight = 1 - recentWeight - rivalWeight;
    const expected = recentMean * recentWeight + seasonMean * seasonWeight + rivalMean * rivalWeight;
    const variance = mean(recentValues.map((value) => (value - recentMean) ** 2));
    const deviation = Math.sqrt(variance);
    const margin = Math.max(1, deviation * 0.85, Math.sqrt(Math.max(expected, 1)) * 0.45);
    const stability = expected > 0 ? deviation / expected : 1;
    const confidence = recentValues.length >= 10 && stability <= 0.35 && (opponent === "ALL" || rivalValues.length >= 3)
      ? "Alta"
      : recentValues.length >= 5 && stability <= 0.65 ? "Media" : "Baja";

    const contextGames = recent;
    const contextAverage = (key: keyof GameLog) => {
      const values = contextGames.map((game) => game[key]).filter((value) => value != null && String(value).trim() !== "").map(Number).filter((value) => Number.isFinite(value) && value >= 0);
      return values.length ? mean(values) : null;
    };

    return {
      expected,
      low: Math.max(0, expected - margin),
      high: expected + margin,
      confidence,
      sample: recentValues.length,
      seasonMean,
      recentMean,
      rivalMean: rivalValues.length ? rivalMean : null,
      rivalSample: rivalValues.length,
      values: recentValues,
      minutes: contextAverage("min"),
      usage: contextAverage("usage_pct"),
      touches: contextAverage("touches"),
      potentialAst: contextAverage("potential_ast"),
      reboundChances: contextAverage("rebound_chances"),
    };
  }, [gameLogs, opponent, range, seasonType, selectedMarket]);

  useEffect(() => {
    if (!marketProjection) return;
    setMarketLine(Math.floor(marketProjection.expected) + 0.5);
  }, [marketProjection?.expected, selectedMarket]);

  const marketHits = marketProjection
    ? marketProjection.values.filter((value) => value > marketLine).length
    : 0;
  const marketHitRate = marketProjection?.values.length
    ? Math.round((marketHits / marketProjection.values.length) * 100)
    : 0;
  const selectedMarketLabel = MARKET_OPTIONS.find((market) => market.id === selectedMarket)?.label || selectedMarket.toUpperCase();

  return (
    <section className="overflow-hidden rounded-2xl border border-cyan-400/20 bg-[var(--surface)] shadow-[0_0_32px_rgba(34,211,238,0.04)]">
      <button type="button" onClick={toggleExpanded} aria-expanded={expanded} className="flex w-full items-center justify-between gap-4 p-4 text-left hover:bg-white/[0.025] md:p-5">
        <span className="min-w-0">
          <span className="flex items-center gap-2 text-cyan-300"><Crosshair size={17} /><span className="text-[10px] font-black uppercase tracking-[0.2em]">Contexto · {selectedSeason}</span></span>
          <span className="mt-1 block text-lg font-black tracking-tight text-[var(--text)]">Tiros y defensa del rival</span>
          <span className="mt-1 block text-xs text-[var(--text-muted)]">{expanded ? "Revisá zonas de tiro, defensores y rendimiento frente al rival." : "El análisis queda cerrado y no ocupa espacio."}</span>
        </span>
        <span className="flex shrink-0 items-center gap-2"><span className="hidden rounded-full border border-cyan-400/20 bg-cyan-400/5 px-3 py-1.5 text-[9px] font-black uppercase text-cyan-200 sm:inline">Abrir contexto</span><ChevronDown size={20} className={`text-cyan-300 transition-transform ${expanded ? "rotate-180" : ""}`} /></span>
      </button>

      {expanded && <div className="border-t border-[var(--border)]">
        <div className="flex flex-wrap items-center gap-3 border-b border-[var(--border)] p-4">
          <label htmlFor={`pro-season-${playerId}`} className="text-xs font-bold text-[var(--text-muted)]">Temporada del análisis</label>
          <select id={`pro-season-${playerId}`} value={selectedSeason} onChange={event => { autoSeason.current = false; setSelectedSeason(event.target.value); }} className="rounded-lg border border-cyan-400/30 bg-[var(--bg)] px-3 py-2 text-xs font-bold text-[var(--text)]">
            {Array.from(new Set([selectedSeason, ...availableSeasons])).sort().reverse().map(season => <option key={season} value={season}>{season}</option>)}
          </select>
          <span className="text-xs text-[var(--text-muted)]">Elegí una temporada con partidos cargados en la base.</span>
        </div>
        {loading && <div className="p-5"><div className="h-5 w-56 animate-pulse rounded bg-white/10" /><div className="mt-4 h-40 animate-pulse rounded-xl bg-white/[0.04]" /></div>}
        {error && <div className="m-4 rounded-xl border border-amber-500/30 bg-amber-500/5 p-5 text-sm text-amber-200">{error}</div>}
        {loaded && !shots.length && !matchups.length && !gameLogs.length && <div className="p-6 text-sm text-[var(--text-muted)]">No se encontraron partidos, tiros ni defensores de {playerName} en {selectedSeason}. Probá otra temporada; si también queda vacía, hay que revisar la carga de datos y el ID del jugador.</div>}

        {loaded && (shots.length > 0 || matchups.length > 0 || gameLogs.length > 0) && <>
          <div className="border-b border-[var(--border)] p-4 md:p-5">
            <div className="grid gap-3 xl:grid-cols-[auto_auto_minmax(150px,1fr)_auto]">
              <div className="flex flex-wrap gap-1.5"><FilterButton active={seasonType === "ALL"} onClick={() => setSeasonType("ALL")}>Todos</FilterButton><FilterButton active={seasonType === "Regular Season"} onClick={() => setSeasonType("Regular Season")}>Regular</FilterButton><FilterButton active={seasonType === "Playoffs"} onClick={() => setSeasonType("Playoffs")}>Playoffs</FilterButton></div>
              <div className="flex flex-wrap gap-1.5">{RANGE_OPTIONS.map((item) => <FilterButton key={item} active={range === item} onClick={() => setRange(item)}>{item ? `L${item}` : "Temporada"}</FilterButton>)}</div>
              <select value={opponent} onChange={(event) => setOpponent(event.target.value)} aria-label="Equipo rival" className="min-h-10 rounded-lg border border-cyan-400/30 bg-[var(--bg)] px-3 text-xs font-black text-[var(--text)]"><option value="ALL">Elegir equipo rival</option>{NBA_TEAM_OPTIONS.map((item) => <option key={item} value={item}>vs {item}</option>)}</select>
              <div className="flex gap-1.5">{POSITION_OPTIONS.map((item) => <FilterButton key={item} active={position === item} onClick={() => setPosition(item)}>{item === "ALL" ? "Todas pos." : item}</FilterButton>)}</div>
            </div>
          </div>

          <div className="space-y-3 p-4 md:p-5">
            <p className="text-xs text-[var(--text-muted)]">Este bloque usa partidos de la muestra del gráfico que tengan contexto en {selectedSeason}. Los controles siguientes refinan esa intersección. Las asignaciones de defensores son de partido completo.</p>
            {sharedSample && sharedSample.scope !== "FULL" ? <p className="text-xs text-amber-300">El gráfico está en un período parcial. Los defensores y el calendario de este bloque se ocultan para evitar mezclar totales; el resumen de rol superior usa el período elegido.</p> : <>
            <NBAProInsights key={playerId} rows={gameLogs.filter(row => !sharedSample || sharedSample.rows.some(sample => keyGame(sample) === keyGame(row)))} shots={shots} playerId={playerId} opponent={opponent} seasonType={seasonType} range={range} nextGameDate={nextGameDate} />
            <CollapsibleSection title="FGA, FGM y escenario de faltas" meta={opponent === "ALL" ? "Elegí un equipo" : `vs ${opponent}`} icon={<Calculator size={16} />} defaultOpen={false}>
              {opponent === "ALL" ? <div className="rounded-xl border border-dashed border-[var(--border)] p-6 text-center text-xs text-[var(--text-muted)]">Seleccioná un equipo rival para calcular FGA, FGM y el escenario de faltas.</div> : projection ? <div className="space-y-4">
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
                  {[{ label: "FGA esperados", value: projection.fga.toFixed(1) }, { label: "FGM esperados", value: projection.fgm.toFixed(1) }, { label: "TC proyectado", value: `${(projection.fgPct * 100).toFixed(1)}%` }, { label: "Rango FGA", value: `${projection.low}–${projection.high}` }].map((item) => <div key={item.label} className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3"><div className="text-[9px] font-black uppercase text-[var(--text-muted)]">{item.label}</div><div className="mt-1 text-2xl font-black">{item.value}</div></div>)}
                  <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3"><div className="text-[9px] font-black uppercase text-[var(--text-muted)]">Tamaño de muestra</div><div className={`mt-1 text-2xl font-black ${projection.confidence === "Alta" ? "text-emerald-300" : projection.confidence === "Media" ? "text-amber-300" : "text-rose-300"}`}>{projection.games} PJ</div><div className="mt-1 text-[9px] text-[var(--text-muted)]">{projection.games} PJ · {projection.possessions.toFixed(0)} poses.</div></div>
                </div>
                <div className="grid gap-2 md:grid-cols-2"><div className="rounded-xl border border-emerald-400/20 bg-emerald-400/5 p-4"><div className="text-[9px] font-black uppercase text-emerald-300">Rotación normal</div><div className="mt-2 text-xl font-black">{projection.fga.toFixed(1)} FGA · {projection.fgm.toFixed(1)} FGM</div><div className="mt-1 text-xs text-[var(--text-muted)]">{(projection.fgPct * 100).toFixed(1)}% de campo estimado</div></div><div className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-4"><div className="text-[9px] font-black uppercase text-amber-300">Principal con faltas</div><div className="mt-2 text-xl font-black">{projection.foulFga.toFixed(1)} FGA · {projection.foulFgm.toFixed(1)} FGM</div><div className="mt-1 text-xs text-[var(--text-muted)]">Δ {(projection.foulFga - projection.fga >= 0 ? "+" : "")}{(projection.foulFga - projection.fga).toFixed(1)} FGA · más segunda rotación</div></div></div>
                <div className="grid gap-2 md:grid-cols-3"><div className="rounded-lg bg-white/[0.035] p-3 text-xs"><span className="block text-[9px] font-black uppercase text-[var(--text-muted)]">Defensor principal</span><span className="mt-1 block font-bold">{projection.primary?.name || "Sin identificar"}</span></div><div className="rounded-lg bg-white/[0.035] p-3 text-xs"><span className="block text-[9px] font-black uppercase text-[var(--text-muted)]">Asignación estimada</span><span className="mt-1 block font-bold">{(projection.primaryShare * 100).toFixed(0)}%</span></div><div className="rounded-lg bg-white/[0.035] p-3 text-xs"><span className="block text-[9px] font-black uppercase text-[var(--text-muted)]">Faltas promedio</span><span className="mt-1 block font-bold">{projection.pfAverage === null ? "S/D" : projection.pfAverage.toFixed(1)} PF{projection.minutes === null ? "" : ` · ${projection.minutes.toFixed(1)} MIN`}</span></div></div>
                <p className="text-[10px] leading-5 text-[var(--text-muted)]">Estimación basada en la muestra elegida y posesiones de matchup, suavizada para no sobrerreaccionar a pocos partidos. El escenario de faltas no es una predicción en vivo.</p>
              </div> : <div className="rounded-xl border border-dashed border-[var(--border)] p-6 text-center text-xs text-[var(--text-muted)]">No hay muestra suficiente para proyectar este rival.</div>}
            </CollapsibleSection>

            <CollapsibleSection title="Marca por equipo y posición" meta={`${filteredGames.length} partidos`} icon={<Shield size={16} />} defaultOpen={false}>
              <div className="space-y-2">{teamGroups.map(([team, rows]) => { const positions = ["G", "F", "C", "S/D"].map((group) => [group, rows.filter((row) => positionGroup(row.defensive_position) === group)] as const).filter(([, items]) => items.length); return <details key={team} open={opponent !== "ALL" || teamGroups.length === 1} className="group rounded-xl border border-[var(--border)] bg-[var(--bg)]"><summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3"><span className="font-black">vs {team}</span><span className="text-right text-[10px] font-bold uppercase text-[var(--text-muted)]">{new Set(rows.map((row) => row.game_id)).size} PJ · {buildDefenderTotals(rows).length} defensores</span></summary><div className="border-t border-[var(--border)] p-2">{positions.map(([group, items]) => <div key={group} className="mb-2 overflow-hidden rounded-lg border border-[var(--border)] last:mb-0"><div className="bg-white/[0.035] px-4 py-2 text-[10px] font-black uppercase tracking-widest text-emerald-300">Posición {group}</div><DefenderTable rows={items} compact /></div>)}</div></details>; })}{!teamGroups.length && <div className="rounded-xl border border-dashed border-[var(--border)] p-6 text-center text-xs text-[var(--text-muted)]">No hay matchups para esta combinación.</div>}</div>
            </CollapsibleSection>

            <CollapsibleSection title="Dos canchas · partido por partido" meta={selectedGame ? `vs ${selectedGame.opponent} · ${dateLabel(selectedGame.date)}` : undefined} icon={<Target size={16} />} defaultOpen={false}>
              {selectedGame && <div className="mb-3 flex items-center justify-center gap-2"><button type="button" disabled={selectedIndex >= filteredGames.length - 1} onClick={() => setSelectedGameId(filteredGames[selectedIndex + 1]?.id || selectedGameId)} className="rounded-lg border border-[var(--border)] p-2 disabled:opacity-30" aria-label="Partido anterior"><ChevronLeft size={16} /></button><div className="min-w-48 text-center"><div className="text-xs font-black">vs {selectedGame.opponent} · {dateLabel(selectedGame.date)}</div><div className="mt-0.5 text-[9px] font-bold uppercase text-[var(--text-muted)]">{selectedGame.seasonType}{selectedGame.log?.wl ? ` · ${selectedGame.log.wl}` : ""}</div></div><button type="button" disabled={selectedIndex <= 0} onClick={() => setSelectedGameId(filteredGames[selectedIndex - 1]?.id || selectedGameId)} className="rounded-lg border border-[var(--border)] p-2 disabled:opacity-30" aria-label="Partido siguiente"><ChevronRight size={16} /></button></div>}
              {selectedGame ? <div className="space-y-4"><div className="rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-3 md:p-4"><ShotCourt shots={selectedShots} /></div><div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg)]"><div className="border-b border-[var(--border)] px-4 py-3"><h4 className="text-xs font-black uppercase">Quién defendió a {playerName}</h4><p className="mt-1 text-[10px] text-[var(--text-muted)]">Ordenado por tiempo de asignación en ese partido.</p></div><DefenderTable rows={selectedMatchups} compact /></div></div> : <div className="rounded-xl border border-dashed border-[var(--border)] p-8 text-center text-xs text-[var(--text-muted)]">No hay partidos para este filtro.</div>}
            </CollapsibleSection>

            <CollapsibleSection title="Rival y defensa por posición" meta={opponent === "ALL" ? "Elegí rival arriba" : `${opponent} · ${playerPosition || "posición"}`} icon={<Shield size={16} />} defaultOpen={false}>
              {opponent !== "ALL" && playerPosition ? <DvpPanel key={`${dvpKey || playerId}:${opponent}:${playerPosition}`} opponentAbbr={opponent} position={playerPosition} /> : <div className="rounded-xl border border-dashed border-[var(--border)] p-6 text-center text-xs text-[var(--text-muted)]">Elegí uno de los 30 equipos en el selector superior para ver su DVP contra la posición de {playerName}.</div>}
            </CollapsibleSection>

            </>}
            <p className="rounded-xl border border-sky-400/20 bg-sky-400/5 px-4 py-3 text-[10px] leading-5 text-sky-100/70">Los puntos muestran tiros reales. Las asignaciones son totales del partido: la fuente no identifica con certeza al defensor de cada tiro individual.</p>
          </div>
        </>}
      </div>}
    </section>
  );
}
