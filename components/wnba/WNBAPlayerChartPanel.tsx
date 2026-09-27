"use client";

import { useEffect, useMemo, useState } from "react";
import { BarChart3, ChevronDown, Filter, ListFilter, RotateCcw, X } from "lucide-react";
import { getWNBATeamTheme } from "./wnbaTeamColors";

type StatOption = {
  id: string;
  label: string;
  accent: string;
  getValue: (row: any) => number;
};

type TeammateGameRow = {
  game_id: string;
  player_id: number;
  player_name: string;
  minutes?: string | number | null;
  comment?: string | null;
};

const STAT_OPTIONS: StatOption[] = [
  { id: "pts", label: "PTS", accent: "#10b981", getValue: (r) => num(r.pts) },
  { id: "reb", label: "REB", accent: "#38bdf8", getValue: (r) => num(r.reb) },
  { id: "ast", label: "AST", accent: "#fbbf24", getValue: (r) => num(r.ast) },
  { id: "pra", label: "PRA", accent: "#a78bfa", getValue: (r) => num(r.pts) + num(r.reb) + num(r.ast) },
  { id: "pa", label: "PA", accent: "#34d399", getValue: (r) => num(r.pts) + num(r.ast) },
  { id: "pr", label: "PR", accent: "#60a5fa", getValue: (r) => num(r.pts) + num(r.reb) },
  { id: "ra", label: "RA", accent: "#f59e0b", getValue: (r) => num(r.reb) + num(r.ast) },
  { id: "fg3m", label: "3PM", accent: "#fb7185", getValue: (r) => num(r.fg3m) },
  { id: "fgm", label: "FGM", accent: "#2dd4bf", getValue: (r) => num(r.fgm) },
  { id: "fga", label: "FGA", accent: "#f97316", getValue: (r) => num(r.fga) },
  { id: "stl", label: "STL", accent: "#4ade80", getValue: (r) => num(r.stl) },
  { id: "blk", label: "BLK", accent: "#818cf8", getValue: (r) => num(r.blk) },
  { id: "tov", label: "TOV", accent: "#f87171", getValue: (r) => num(r.tov ?? r.turnovers) },
];

const MAIN_STAT_IDS = new Set(["pts", "reb", "ast", "pra", "pa", "pr", "ra", "fg3m", "fgm", "fga"]);
const MORE_STAT_IDS = new Set(["stl", "blk", "tov"]);
const LAST_N = [30, 20, 10, 5];

function num(value: any) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function minutesNum(value: any) {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const raw = String(value).trim();
  if (!raw) return 0;
  if (raw.includes(":")) {
    const [m, s] = raw.split(":").map(Number);
    return (Number.isFinite(m) ? m : 0) + (Number.isFinite(s) ? s / 60 : 0);
  }
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function fmt(value: number, digits = 1) {
  if (!Number.isFinite(value)) return "—";
  return value.toFixed(digits);
}

function toBetLine(value: number) {
  if (!Number.isFinite(value)) return 0.5;
  return Math.max(0.5, Number((Math.round(value - 0.5) + 0.5).toFixed(1)));
}

function getOpponent(row: any) {
  return String(row.opponent_abbr || row.opponent || row.opp || "S/D").toUpperCase();
}

function getHomeAway(row: any) {
  const v = String(row.home_away || "").toUpperCase();
  return v === "AWAY" ? "AWAY" : v === "HOME" ? "HOME" : "";
}

function getGameLabel(row: any) {
  const team = String(row.team_abbreviation || row.team_abbr || "WNBA").toUpperCase();
  const opp = getOpponent(row);
  const loc = getHomeAway(row) === "AWAY" ? "@" : "vs";
  return `${team} ${loc} ${opp}`;
}

function dateOnly(value: any) {
  return String(value || "").slice(0, 10);
}

export default function WNBAPlayerChartPanel({ stats, teamAbbr, teammateGames = [] }: { stats: any[]; teamAbbr?: string | null; teammateGames?: TeammateGameRow[] }) {
  const [activeStat, setActiveStat] = useState("pts");
  const [lastN, setLastN] = useState(30);
  const [opponent, setOpponent] = useState("ALL");
  const [homeAway, setHomeAway] = useState("ALL");
  const [minuteLine, setMinuteLine] = useState(0);
  const [minuteOperator, setMinuteOperator] = useState<"gte" | "lte">("gte");
  const [teammateId, setTeammateId] = useState("ALL");
  const [teammateStatus, setTeammateStatus] = useState<"ALL" | "PLAYED" | "OUT" | "INJURY" | "COACH">("ALL");
  const [side, setSide] = useState<"over" | "under">("over");
  const [lineValue, setLineValue] = useState(0.5);
  const [showMore, setShowMore] = useState(false);

  const stat = STAT_OPTIONS.find((s) => s.id === activeStat) || STAT_OPTIONS[0];
  const inferredTeam = teamAbbr || stats?.find((s) => s?.team_abbreviation || s?.team_abbr)?.team_abbreviation || stats?.find((s) => s?.team_abbr)?.team_abbr || null;
  const theme = getWNBATeamTheme(inferredTeam);
  const activeColor = stat.accent || theme.primary;

  const normalized = useMemo(() => {
    return [...(stats || [])]
      .map((row) => {
        const pts = num(row.pts);
        const reb = num(row.reb);
        const ast = num(row.ast);
        const min = minutesNum(row.min ?? row.minutes);
        const value = stat.getValue(row);
        return {
          ...row,
          pts,
          reb,
          ast,
          pra: pts + reb + ast,
          pa: pts + ast,
          pr: pts + reb,
          ra: reb + ast,
          fg3m: num(row.fg3m),
          min,
          minutes: row.minutes ?? row.min,
          value,
          matchup: row.matchup || getGameLabel(row),
          opponent_abbr: getOpponent(row),
          game_date: row.game_date,
        };
      })
      .filter((row) => row.min > 0)
      .sort((a, b) => new Date(b.game_date || 0).getTime() - new Date(a.game_date || 0).getTime());
  }, [stats, stat]);

  const opponents = useMemo(() => {
    // normalized ya está ordenado del partido más reciente al más antiguo.
    // Set conserva la primera aparición, por lo que el último rival queda primero.
    return Array.from(new Set(normalized.map((r) => getOpponent(r)).filter(Boolean)));
  }, [normalized]);

  const teammateOptions = useMemo(() => {
    const players = new Map<number, string>();
    for (const row of teammateGames) {
      const id = Number(row.player_id);
      if (Number.isFinite(id) && id > 0 && row.player_name) players.set(id, row.player_name);
    }
    return Array.from(players, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [teammateGames]);

  const teammateByGame = useMemo(() => {
    const games = new Map<string, Map<number, TeammateGameRow>>();
    for (const row of teammateGames) {
      const gameId = String(row.game_id);
      if (!games.has(gameId)) games.set(gameId, new Map());
      games.get(gameId)?.set(Number(row.player_id), row);
    }
    return games;
  }, [teammateGames]);

  const teammateReasonOptions = useMemo(() => {
    const comments = teammateGames.map((row) => String(row.comment || "").toLowerCase());
    return {
      injury: comments.some((comment) => /injury|illness|concussion|reconditioning/.test(comment)),
      coach: comments.some((comment) => /coach/.test(comment)),
    };
  }, [teammateGames]);

  const filtered = useMemo(() => {
    const base = normalized.filter((row) => {
      if (opponent !== "ALL" && getOpponent(row) !== opponent) return false;
      if (homeAway !== "ALL" && getHomeAway(row) !== homeAway) return false;
      const playedMinutes = minutesNum(row.min ?? row.minutes);
      if (minuteLine > 0 && minuteOperator === "gte" && playedMinutes < minuteLine) return false;
      if (minuteLine > 0 && minuteOperator === "lte" && playedMinutes > minuteLine) return false;
      if (teammateId !== "ALL") {
        const teammate = teammateByGame.get(String(row.game_id))?.get(Number(teammateId));
        if (!teammate) return false;
        const teammateMinutes = minutesNum(teammate.minutes);
        const comment = String(teammate.comment || "").toLowerCase();
        if (teammateStatus === "PLAYED" && teammateMinutes <= 0) return false;
        if (teammateStatus === "OUT" && teammateMinutes > 0) return false;
        if (teammateStatus === "INJURY" && (teammateMinutes > 0 || !/injury|illness|concussion|reconditioning/.test(comment))) return false;
        if (teammateStatus === "COACH" && (teammateMinutes > 0 || !/coach/.test(comment))) return false;
      }
      return true;
    });

    return base.slice(0, lastN);
  }, [normalized, opponent, homeAway, minuteLine, minuteOperator, teammateId, teammateStatus, teammateByGame, lastN]);

  const chartRows = useMemo(() => [...filtered].reverse(), [filtered]);

  const summary = useMemo(() => {
    const values = filtered.map((r) => num(r.value));
    const games = values.length;
    const avg = games ? values.reduce((a, b) => a + b, 0) / games : 0;
    const isHit = (value: number) => side === "under" ? value < lineValue : value > lineValue;
    const hits = values.filter(isHit).length;
    const high = games ? Math.max(...values) : 0;
    const low = games ? Math.min(...values) : 0;
    const ordered = [...values].sort((a, b) => a - b);
    const middle = Math.floor(games / 2);
    const median = games ? (games % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2) : 0;
    let streak = 0;
    for (const value of values) {
      if (!isHit(value)) break;
      streak += 1;
    }
    const recent = values.slice(0, 5);
    const previous = values.slice(5, 10);
    const recentAvg = recent.length ? recent.reduce((a, b) => a + b, 0) / recent.length : 0;
    const previousAvg = previous.length ? previous.reduce((a, b) => a + b, 0) / previous.length : recentAvg;
    const trend = recentAvg - previousAvg;
    return { games, avg, median, hits, hitRate: games ? (hits / games) * 100 : 0, high, low, streak, trend, recentAvg };
  }, [filtered, lineValue, side]);

  const moveLine = (delta: number) => {
    setLineValue((prev) => Math.max(0.5, Number((toBetLine(prev) + delta).toFixed(1))));
  };

  const resetFilters = () => {
    setLastN(30);
    setOpponent("ALL");
    setHomeAway("ALL");
    setMinuteLine(0);
    setMinuteOperator("gte");
    setTeammateId("ALL");
    setTeammateStatus("ALL");
    setSide("over");
  };

  useEffect(() => {
    const values = normalized.slice(0, 10).map((r) => stat.getValue(r));
    const avg = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
    setLineValue(toBetLine(avg));
  }, [activeStat, normalized, stat]);

  return (
    <section
      className="rounded-[1.65rem] border p-4 md:p-5 min-w-0 overflow-hidden"
      style={{
        borderColor: `${theme.primary}33`,
        background: `radial-gradient(circle at 10% 0%, ${theme.glow}, transparent 30%), linear-gradient(180deg, rgba(8,13,22,.98), rgba(3,6,10,.98))`,
      }}
    >
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between mb-5">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.28em] flex items-center gap-2" style={{ color: theme.primary }}>
            <BarChart3 size={14} /> Rendimiento
          </p>
          <h2 className="mt-1 text-2xl md:text-3xl font-black italic uppercase tracking-tighter">
            Rendimiento por partido
          </h2>
        </div>

        <div className="flex max-w-[760px] flex-wrap justify-start gap-2 xl:justify-end">
          {STAT_OPTIONS.filter((item) => MAIN_STAT_IDS.has(item.id)).map((s) => {
            const active = activeStat === s.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setActiveStat(s.id)}
                className="rounded-xl border px-3 py-2 text-[10px] font-black uppercase tracking-widest transition-all"
                style={{
                  borderColor: active ? s.accent : "rgba(148,163,184,.22)",
                  background: active ? `${s.accent}18` : "rgba(2,6,12,.72)",
                  color: active ? s.accent : "rgb(148 163 184)",
                  boxShadow: active ? `inset 0 0 0 1px ${s.accent}24, 0 0 18px ${s.accent}14` : "none",
                }}
              >
                {s.label}
              </button>
            );
          })}
          <button type="button" onClick={() => setShowMore((value) => !value)} className="inline-flex items-center gap-1 rounded-xl border border-white/15 bg-[#02060c] px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-300 transition hover:border-white/30 hover:text-white">
            Más <ChevronDown size={12} className={`transition-transform ${showMore ? "rotate-180" : ""}`} />
          </button>
          {showMore && STAT_OPTIONS.filter((item) => MORE_STAT_IDS.has(item.id)).map((s) => {
            const active = activeStat === s.id;
            return <button key={s.id} type="button" onClick={() => setActiveStat(s.id)} className="rounded-xl border px-3 py-2 text-[10px] font-black uppercase tracking-widest transition-all" style={{ borderColor: active ? s.accent : "rgba(148,163,184,.22)", background: active ? `${s.accent}18` : "rgba(2,6,12,.72)", color: active ? s.accent : "rgb(148 163 184)" }}>{s.label}</button>;
          })}
        </div>
      </div>

      <div className="mb-5 grid gap-3 rounded-[1.35rem] border border-white/10 bg-[#03070c] p-3 lg:grid-cols-[minmax(0,1fr)_330px]">
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 inline-flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)]">
            <Filter size={12} /> Muestra
          </span>
          {LAST_N.map((n) => {
            const active = lastN === n;
            return (
              <button
                key={n}
                type="button"
                onClick={() => setLastN(n)}
                className="min-w-14 rounded-xl border px-3 py-2 text-[10px] font-black uppercase tracking-widest"
                style={{ borderColor: active ? theme.primary : "rgba(148,163,184,.22)", background: active ? `${theme.primary}16` : "rgba(2,6,12,.72)", color: active ? theme.primary : "rgb(148 163 184)" }}
              >
                L{n}
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-[38px_1fr_38px_76px] gap-2">
          <button type="button" onClick={() => moveLine(-1)} className="rounded-xl border border-white/10 bg-[#07131a] text-xl font-black" aria-label="Bajar línea">−</button>
          <div className="flex flex-col items-center justify-center rounded-xl border border-white/10 bg-[#07131a]">
            <span className="text-[7px] font-black uppercase tracking-widest text-[var(--text-muted)]">Línea</span>
            <strong className="text-lg font-black tabular-nums text-white">{lineValue.toFixed(1)}</strong>
          </div>
          <button type="button" onClick={() => moveLine(1)} className="rounded-xl border border-white/10 bg-[#07131a] text-xl font-black" aria-label="Subir línea">+</button>
          <div className="flex flex-col items-center justify-center rounded-xl border border-white/10 bg-[#07131a]">
            <span className="text-[7px] font-black uppercase tracking-widest text-[var(--text-muted)]">HR</span>
            <span className="text-lg font-black" style={{ color: summary.hitRate >= 50 ? "#22c55e" : "#ef4444" }}>{fmt(summary.hitRate, 0)}%</span>
          </div>
        </div>
      </div>

      <div className="grid min-w-0 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_270px]">
        <div className="min-w-0 self-start overflow-hidden rounded-[1.35rem] border border-white/10 bg-[#03070c] p-3 md:p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 px-1">
            <p className="text-[9px] font-black uppercase tracking-[0.22em]" style={{ color: activeColor }}>{stat.label} por partido</p>
            <p className="text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)]">{summary.hits}/{summary.games} hits · promedio {fmt(summary.avg)} · mediana {fmt(summary.median)}</p>
          </div>
          <div className="overflow-x-auto [scrollbar-width:thin]">
            <WNBAColorBars rows={chartRows} statLabel={stat.label} lineValue={lineValue} side={side} activeColor={activeColor} />
          </div>
        </div>

        <aside className="self-start rounded-[1.35rem] border p-3" style={{ borderColor: `${theme.primary}28`, background: `linear-gradient(180deg, ${theme.primary}08, rgba(3,7,12,.98) 28%)` }}>
          <div className="mb-3 flex items-center justify-between">
            <p className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.2em]" style={{ color: theme.primary }}><Filter size={12} /> Filtros</p>
            <button type="button" onClick={resetFilters} className="flex items-center gap-1 rounded-lg border border-white/10 px-2 py-1 text-[8px] font-black uppercase tracking-widest text-[var(--text-muted)] hover:text-white"><RotateCcw size={10} /> Reset</button>
          </div>

          <FilterBlock label="Lado">
            <div className="grid grid-cols-2 gap-1 rounded-xl border border-white/10 bg-[#07131a] p-1">
              {(["over", "under"] as const).map((v) => (
                <button key={v} type="button" onClick={() => setSide(v)} className="rounded-lg px-2 py-2 text-[9px] font-black uppercase" style={{ background: side === v ? (v === "over" ? "#22c55e" : "#ef4444") : "transparent", color: side === v ? "#050505" : "rgb(148 163 184)" }}>{v}</button>
              ))}
            </div>
          </FilterBlock>

          <FilterBlock label="Cancha">
            <div className="grid grid-cols-3 gap-1 rounded-xl border border-white/10 bg-[#07131a] p-1">
              {[["ALL", "Cualquiera"], ["HOME", "Local"], ["AWAY", "Visit."]].map(([value, label]) => (
                <button key={value} type="button" onClick={() => setHomeAway(value)} className="rounded-lg border px-1 py-2 text-[8px] font-black uppercase" style={{ borderColor: homeAway === value ? theme.primary : "transparent", background: homeAway === value ? `${theme.primary}16` : "transparent", color: homeAway === value ? theme.primary : "rgb(148 163 184)" }}>{label}</button>
              ))}
            </div>
          </FilterBlock>

          <FilterBlock label="Minutos">
            <div className="mb-2 grid grid-cols-[76px_1fr_36px] gap-2">
              <div className="grid grid-cols-2 gap-1 rounded-xl border border-white/10 bg-[#07131a] p-1">
                {(["gte", "lte"] as const).map((operator) => (
                  <button key={operator} type="button" onClick={() => setMinuteOperator(operator)} className="rounded-lg border py-2 text-xs font-black" style={{ borderColor: minuteOperator === operator ? theme.primary : "transparent", background: minuteOperator === operator ? `${theme.primary}16` : "transparent", color: minuteOperator === operator ? theme.primary : "rgb(148 163 184)" }}>{operator === "gte" ? "≥" : "≤"}</button>
                ))}
              </div>
              <label className="relative">
                <span className="pointer-events-none absolute left-3 top-1 text-[7px] font-black uppercase tracking-widest text-[var(--text-muted)]">Línea MIN</span>
                <input type="number" min={0} max={60} step={1} value={minuteLine || ""} placeholder="—" onChange={(event) => setMinuteLine(Math.max(0, Number(event.target.value) || 0))} className="h-full w-full rounded-xl border border-white/10 bg-[#07131a] px-3 pb-1 pt-3 text-sm font-black text-white outline-none" />
              </label>
              <button type="button" onClick={() => setMinuteLine(0)} aria-label="Quitar filtro de minutos" className="flex items-center justify-center rounded-xl border border-white/10 bg-[#07131a] text-white/45 transition hover:text-white"><X size={13} /></button>
            </div>
            <div className="grid grid-cols-5 gap-1">
              {[20, 25, 30, 35, 40].map((value) => (
                <button key={value} type="button" onClick={() => setMinuteLine(value)} className="rounded-lg border px-1 py-2 text-[8px] font-black" style={{ borderColor: minuteLine === value ? theme.primary : "rgba(148,163,184,.18)", background: minuteLine === value ? `${theme.primary}16` : "#07131a", color: minuteLine === value ? theme.primary : "rgb(148 163 184)" }}>{value}</button>
              ))}
            </div>
            <p className="mt-2 text-[8px] font-black uppercase tracking-widest text-white/40">{minuteLine ? `Partidos con MIN ${minuteOperator === "gte" ? "≥" : "≤"} ${minuteLine}` : "Sin filtro de minutos"}</p>
          </FilterBlock>

          <FilterBlock label="Rival">
            <select value={opponent} onChange={(e) => setOpponent(e.target.value)} className="w-full rounded-xl border border-white/10 bg-[#07131a] px-3 py-3 text-xs font-black uppercase text-white outline-none">
              <option value="ALL">Cualquier rival</option>
              {opponents.map((opp) => <option key={opp} value={opp}>{opp}</option>)}
            </select>
          </FilterBlock>

          <FilterBlock label="Compañera">
            <select
              value={teammateId}
              onChange={(event) => {
                const value = event.target.value;
                setTeammateId(value);
                setTeammateStatus(value === "ALL" ? "ALL" : "OUT");
              }}
              className="w-full rounded-xl border border-white/10 bg-[#07131a] px-3 py-3 text-xs font-black uppercase text-white outline-none"
            >
              <option value="ALL">Cualquier compañera</option>
              {teammateOptions.map((player) => <option key={player.id} value={String(player.id)}>{player.name}</option>)}
            </select>
            {teammateId !== "ALL" && (
              <div className="mt-2 grid grid-cols-2 gap-1">
                {([
                  ["PLAYED", "Jugó"],
                  ["OUT", "No jugó"],
                  ...(teammateReasonOptions.injury ? [["INJURY", "Lesión"]] : []),
                  ...(teammateReasonOptions.coach ? [["COACH", "Técnica"]] : []),
                ] as Array<["PLAYED" | "OUT" | "INJURY" | "COACH", string]>).map(([value, label]) => (
                  <button key={value} type="button" onClick={() => setTeammateStatus(value)} className="rounded-lg border px-2 py-2 text-[8px] font-black uppercase" style={{ borderColor: teammateStatus === value ? theme.primary : "rgba(148,163,184,.18)", background: teammateStatus === value ? `${theme.primary}16` : "#07131a", color: teammateStatus === value ? theme.primary : "rgb(148 163 184)" }}>{label}</button>
                ))}
              </div>
            )}
            <p className="mt-2 text-[7px] font-bold leading-relaxed text-white/35">Solo cuenta partidos con registro confirmado de esa jugadora.</p>
          </FilterBlock>
        </aside>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Metric label={`AVG ${stat.label}`} value={fmt(summary.avg)} color={activeColor} />
        <Metric label="Mediana" value={fmt(summary.median)} color={theme.primary} />
        <Metric label="Hit rate" value={`${summary.hits}/${summary.games} · ${fmt(summary.hitRate, 0)}%`} color={summary.hitRate >= 50 ? "#22c55e" : "#ef4444"} />
        <Metric label="Racha actual" value={summary.streak ? `${summary.streak} HIT${summary.streak === 1 ? "" : "S"}` : "Sin racha"} color={summary.streak ? "#22c55e" : "#94a3b8"} />
        <Metric label="Tendencia L5" value={`${summary.trend >= 0 ? "+" : ""}${fmt(summary.trend)}`} color={summary.trend >= 0 ? "#22c55e" : "#ef4444"} />
      </div>

      <details className="group mt-5 rounded-[1.35rem] border border-white/10 bg-[#03070c] overflow-hidden">
        <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-4">
          <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.25em]" style={{ color: theme.primary }}><ListFilter size={13} /> Ver historial filtrado</p>
          <p className="text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)]">{summary.games} partidos</p>
        </summary>
        <div className="max-h-[480px] overflow-auto border-t border-white/10">
          <table className="w-full min-w-[780px] text-left">
            <thead className="sticky top-0 bg-[#07131a] text-[9px] uppercase tracking-widest text-[var(--text-muted)]">
              <tr><th className="px-4 py-3">Fecha</th><th className="px-4 py-3">Partido</th><th className="px-4 py-3 text-right">MIN</th><th className="px-4 py-3 text-right">PTS</th><th className="px-4 py-3 text-right">REB</th><th className="px-4 py-3 text-right">AST</th><th className="px-4 py-3 text-right">PRA</th><th className="px-4 py-3 text-right">3PM</th><th className="px-4 py-3 text-right">{stat.label}</th></tr>
            </thead>
            <tbody className="text-xs font-black">
              {filtered.map((row, index) => {
                const hit = side === "under" ? num(row.value) < lineValue : num(row.value) > lineValue;
                return <tr key={`${row.game_id || row.game_date}-${index}`} className="border-b border-white/10 hover:bg-white/[0.035]"><td className="px-4 py-3 text-[var(--text-muted)]">{dateOnly(row.game_date)}</td><td className="px-4 py-3 uppercase">{row.matchup || getGameLabel(row)}</td><td className="px-4 py-3 text-right">{fmt(minutesNum(row.min ?? row.minutes))}</td><td className="px-4 py-3 text-right">{num(row.pts)}</td><td className="px-4 py-3 text-right">{num(row.reb)}</td><td className="px-4 py-3 text-right">{num(row.ast)}</td><td className="px-4 py-3 text-right" style={{ color: activeColor }}>{num(row.pts) + num(row.reb) + num(row.ast)}</td><td className="px-4 py-3 text-right">{num(row.fg3m)}</td><td className="px-4 py-3 text-right" style={{ color: hit ? "#22c55e" : "#ef4444" }}>{fmt(num(row.value))}</td></tr>;
              })}
              {!filtered.length && <tr><td colSpan={9} className="px-4 py-10 text-center text-[var(--text-muted)] uppercase tracking-widest">Sin partidos para esos filtros</td></tr>}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}

function WNBAColorBars({ rows, statLabel, lineValue, side, activeColor }: { rows: any[]; statLabel: string; lineValue: number; side: "over" | "under"; activeColor: string }) {
  const [hovered, setHovered] = useState<{ row: any; index: number } | null>(null);
  const values = rows.map((r) => num(r.value));
  const maxValue = Math.max(lineValue, ...values, 1);
  const scaleMax = Math.max(5, Math.ceil((maxValue * 1.16) / 5) * 5);
  const lineTop = Math.max(2, Math.min(98, 100 - (lineValue / scaleMax) * 100));
  const ticks = [0, .25, .5, .75, 1].map((ratio) => ({ ratio, value: scaleMax * ratio }));
  const chartWidth = Math.max(660, rows.length * 28);
  const hoverValue = hovered ? num(hovered.row.value) : 0;
  const hoverHit = hovered ? (side === "under" ? hoverValue < lineValue : hoverValue > lineValue) : false;
  const hoverMargin = side === "under" ? lineValue - hoverValue : hoverValue - lineValue;
  const tooltipLeft = hovered && rows.length > 1
    ? Math.max(17, Math.min(83, (hovered.index / (rows.length - 1)) * 100))
    : 50;

  return (
    <div
      className="relative h-[370px] rounded-2xl bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,.055),transparent_38%)]"
      style={{ minWidth: `${chartWidth}px` }}
      onMouseLeave={() => setHovered(null)}
    >
      <div className="absolute bottom-[64px] left-11 right-3 top-[42px]">
        <div className="absolute inset-x-0 top-0 rounded-t-xl" style={{ height: `${lineTop}%`, background: side === "over" ? "rgba(34,197,94,.035)" : "rgba(239,68,68,.035)" }} />
        <div className="absolute inset-x-0 bottom-0 rounded-b-xl" style={{ height: `${100 - lineTop}%`, background: side === "over" ? "rgba(239,68,68,.035)" : "rgba(34,197,94,.035)" }} />

        {ticks.map((tick) => (
          <div key={tick.ratio} className="absolute inset-x-0 border-t border-white/[0.08]" style={{ top: `${100 - tick.ratio * 100}%` }}>
            <span className="absolute -left-10 -translate-y-1/2 text-[8px] font-black tabular-nums text-white/35">{fmt(tick.value, tick.value >= 10 ? 0 : 1)}</span>
          </div>
        ))}

        <div className="absolute inset-x-0 z-20 border-t-2" style={{ top: `${lineTop}%`, borderColor: activeColor, boxShadow: `0 0 10px ${activeColor}88` }}>
          <span className="absolute right-1 top-0 -translate-y-1/2 rounded-lg border px-2 py-1 text-[9px] font-black uppercase tracking-widest text-black shadow-xl" style={{ borderColor: activeColor, background: activeColor }}>
            Línea · {lineValue.toFixed(1)}
          </span>
        </div>

        <div className="absolute inset-0 z-10 grid items-end gap-1.5" style={{ gridTemplateColumns: `repeat(${Math.max(rows.length, 1)}, minmax(0, 1fr))` }}>
        {rows.map((row, idx) => {
          const value = num(row.value);
          const height = Math.max(2, (value / scaleMax) * 100);
          const hit = side === "under" ? value < lineValue : value > lineValue;
          const barColor = hit ? "#22c55e" : "#ef4444";
          const isHovered = hovered?.index === idx;
          return (
            <button
              key={`${row.game_id || row.game_date}-${idx}`}
              type="button"
              onMouseEnter={() => setHovered({ row, index: idx })}
              onFocus={() => setHovered({ row, index: idx })}
              onBlur={() => setHovered(null)}
              className="group relative h-full min-w-0 outline-none transition-opacity"
              style={{ opacity: hovered && !isHovered ? .42 : 1 }}
              aria-label={`${row.matchup || getGameLabel(row)}: ${statLabel} ${fmt(value)}`}
            >
              <div
                className="absolute inset-x-[10%] bottom-0 rounded-t-lg border border-white/10 transition-all duration-150 group-hover:brightness-125 group-focus:brightness-125"
                style={{ height: `${height}%`, background: `linear-gradient(180deg, ${barColor}, ${barColor}88)`, boxShadow: isHovered ? `0 0 24px ${barColor}88` : `0 0 12px ${barColor}2b`, transform: isHovered ? "scaleX(1.08)" : "scaleX(1)" }}
              >
                <span className="absolute -top-5 left-1/2 -translate-x-1/2 whitespace-nowrap text-[9px] font-black tabular-nums" style={{ color: barColor }}>{hit ? "✓" : "×"} {fmt(value, value >= 10 ? 0 : 1)}</span>
              </div>
              <div className="absolute left-1/2 top-[calc(100%+8px)] w-[44px] -translate-x-1/2 text-center">
                <p className="truncate text-[8px] font-black uppercase text-slate-300">{getOpponent(row)}</p>
                <p className="mt-0.5 whitespace-nowrap text-[7px] font-black uppercase text-white/35">{dateOnly(row.game_date).slice(5)} · {String(row.wl || "—").slice(0, 1)}</p>
              </div>
            </button>
          );
        })}
        {!rows.length && (
          <div className="col-span-full flex h-full w-full items-center justify-center text-xs font-black uppercase tracking-widest text-[var(--text-muted)]">
            Sin datos para graficar
          </div>
        )}
        </div>
      </div>

      <div className="absolute left-12 top-3 flex items-center gap-3 text-[8px] font-black uppercase tracking-widest text-white/45">
        <span className="inline-flex items-center gap-1"><i className="h-2 w-2 rounded-sm bg-[#22c55e]" /> ✓ Hit</span>
        <span className="inline-flex items-center gap-1"><i className="h-2 w-2 rounded-sm bg-[#ef4444]" /> × Miss</span>
        <span>{side === "over" ? "Sobre" : "Bajo"} {lineValue.toFixed(1)}</span>
      </div>

      {hovered && (
        <div className="pointer-events-none absolute top-12 z-40 w-[250px] -translate-x-1/2 rounded-2xl border border-white/15 bg-[#071017]/95 p-3 text-left shadow-2xl backdrop-blur-md" style={{ left: `${tooltipLeft}%`, boxShadow: `0 18px 50px rgba(0,0,0,.65), 0 0 22px ${hoverHit ? "rgba(34,197,94,.18)" : "rgba(239,68,68,.18)"}` }}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[8px] font-black uppercase tracking-[0.2em] text-white/45">{dateOnly(hovered.row.game_date)} · {getHomeAway(hovered.row) === "AWAY" ? "Visitante" : getHomeAway(hovered.row) === "HOME" ? "Local" : "Partido"}</p>
              <p className="mt-1 text-sm font-black uppercase text-white">{hovered.row.matchup || getGameLabel(hovered.row)}</p>
            </div>
            <span className="rounded-lg px-2 py-1 text-[8px] font-black uppercase text-black" style={{ background: hoverHit ? "#22c55e" : "#ef4444" }}>{hoverHit ? "✓ HIT" : "× MISS"}</span>
          </div>
          <div className="mt-3 flex items-end justify-between border-y border-white/10 py-2">
            <div><p className="text-[8px] font-black uppercase tracking-widest text-white/45">{statLabel}</p><p className="text-3xl font-black italic" style={{ color: hoverHit ? "#22c55e" : "#ef4444" }}>{fmt(hoverValue)}</p></div>
            <div className="text-right"><p className="text-[8px] font-black uppercase tracking-widest text-white/45">Vs línea {lineValue.toFixed(1)}</p><p className="text-lg font-black" style={{ color: hoverMargin >= 0 ? "#22c55e" : "#ef4444" }}>{hoverMargin >= 0 ? "+" : ""}{fmt(hoverMargin)}</p></div>
          </div>
          <div className="mt-2 grid grid-cols-5 gap-1 text-center">
            <TooltipMetric label="MIN" value={fmt(minutesNum(hovered.row.min ?? hovered.row.minutes))} />
            <TooltipMetric label="PTS" value={String(num(hovered.row.pts))} />
            <TooltipMetric label="REB" value={String(num(hovered.row.reb))} />
            <TooltipMetric label="AST" value={String(num(hovered.row.ast))} />
            <TooltipMetric label="R" value={String(hovered.row.wl || "—").slice(0, 1)} />
          </div>
        </div>
      )}
    </div>
  );
}

function TooltipMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-white/[0.045] px-1 py-2">
      <p className="text-[7px] font-black uppercase tracking-widest text-white/35">{label}</p>
      <p className="mt-0.5 text-[11px] font-black text-white">{value}</p>
    </div>
  );
}

function FilterBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-3 rounded-2xl border border-white/10 bg-black/20 p-3">
      <p className="mb-2 text-[8px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)]">{label}</p>
      {children}
    </div>
  );
}

function Metric({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#03070c] px-4 py-3">
      <p className="text-[8px] font-black uppercase tracking-widest text-[var(--text-muted)]">{label}</p>
      <p className="mt-1 text-2xl font-black italic tracking-tighter" style={{ color: color || "white" }}>{value}</p>
    </div>
  );
}
