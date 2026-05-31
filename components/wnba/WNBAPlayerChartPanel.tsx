"use client";

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { BarChart3, Filter, ListFilter } from "lucide-react";
import { getWNBATeamTheme } from "./wnbaTeamColors";

type StatOption = {
  id: string;
  label: string;
  accent: string;
  getValue: (row: any) => number;
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
  { id: "min", label: "MIN", accent: "#cbd5e1", getValue: (r) => minutesNum(r.min ?? r.minutes) },
];

const LAST_N = [5, 10, 15, 20, 0];

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

function filterCardStyle(theme: ReturnType<typeof getWNBATeamTheme>) {
  return {
    borderColor: `${theme.primary}33`,
    background: `linear-gradient(145deg, ${theme.soft}, rgba(4, 8, 14, .94))`,
    boxShadow: `inset 0 1px 0 rgba(255,255,255,.035)`,
  } as CSSProperties;
}

function selectClass() {
  return "mt-2 w-full rounded-xl border border-white/10 bg-[#07131a] px-3 py-2 text-sm font-black uppercase text-white outline-none focus:border-[#10b981]/70";
}

export default function WNBAPlayerChartPanel({ stats, teamAbbr }: { stats: any[]; teamAbbr?: string | null }) {
  const [activeStat, setActiveStat] = useState("pts");
  const [lastN, setLastN] = useState(10);
  const [opponent, setOpponent] = useState("ALL");
  const [homeAway, setHomeAway] = useState("ALL");
  const [minMinutes, setMinMinutes] = useState(0);
  const [side, setSide] = useState<"over" | "under">("over");
  const [lineValue, setLineValue] = useState(0.5);

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
      .sort((a, b) => new Date(b.game_date || 0).getTime() - new Date(a.game_date || 0).getTime());
  }, [stats, stat]);

  const opponents = useMemo(() => {
    return Array.from(new Set(normalized.map((r) => getOpponent(r)).filter(Boolean))).sort();
  }, [normalized]);

  const filtered = useMemo(() => {
    const base = normalized.filter((row) => {
      if (opponent !== "ALL" && getOpponent(row) !== opponent) return false;
      if (homeAway !== "ALL" && getHomeAway(row) !== homeAway) return false;
      if (minMinutes > 0 && minutesNum(row.min ?? row.minutes) < minMinutes) return false;
      return true;
    });

    return lastN > 0 ? base.slice(0, lastN) : base;
  }, [normalized, opponent, homeAway, minMinutes, lastN]);

  const chartRows = useMemo(() => [...filtered].reverse(), [filtered]);

  const summary = useMemo(() => {
    const values = filtered.map((r) => num(r.value));
    const games = values.length;
    const avg = games ? values.reduce((a, b) => a + b, 0) / games : 0;
    const hits = values.filter((v) => (side === "under" ? v < lineValue : v > lineValue)).length;
    const high = games ? Math.max(...values) : 0;
    const low = games ? Math.min(...values) : 0;
    return { games, avg, hits, hitRate: games ? (hits / games) * 100 : 0, high, low };
  }, [filtered, lineValue, side]);

  const lineOptions = useMemo(() => {
    const values = normalized.map((r) => num(r.value));
    const max = Math.max(lineValue, ...values, 1);
    const min = Math.min(lineValue, ...values, 0);
    const start = Math.max(0, Math.floor(min) - 5) + 0.5;
    const end = Math.ceil(max) + 8 + 0.5;
    const options: number[] = [];
    for (let value = start; value <= end + 0.001; value += 1) {
      options.push(Number(value.toFixed(1)));
    }
    if (!options.includes(lineValue)) options.push(lineValue);
    return options.sort((a, b) => a - b);
  }, [normalized, lineValue]);

  const moveLine = (delta: number) => {
    setLineValue((prev) => Math.max(0.5, Number((toBetLine(prev) + delta).toFixed(1))));
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
            <BarChart3 size={14} /> Player chart
          </p>
          <h2 className="mt-1 text-2xl md:text-3xl font-black italic uppercase tracking-tighter">
            Rendimiento por partido
          </h2>
        </div>

        <div className="flex flex-wrap gap-2">
          {STAT_OPTIONS.map((s) => {
            const active = activeStat === s.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setActiveStat(s.id)}
                className="rounded-xl border px-3 py-2 text-[10px] font-black uppercase tracking-widest transition-all"
                style={{
                  borderColor: active ? s.accent : "rgba(148,163,184,.22)",
                  background: active ? s.accent : "rgba(2,6,12,.72)",
                  color: active ? "#050505" : "rgb(148 163 184)",
                  boxShadow: active ? `0 0 24px ${s.accent}33` : "none",
                }}
              >
                {s.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3 mb-5">
        <div className="rounded-2xl border p-3" style={filterCardStyle(theme)}>
          <p className="text-[8px] font-black uppercase tracking-widest" style={{ color: theme.primary }}>Línea</p>
          <div className="mt-1 grid grid-cols-[40px_1fr_40px] gap-2">
            <button
              type="button"
              onClick={() => moveLine(-1)}
              className="rounded-xl border border-white/10 bg-[#07131a] text-xl font-black text-white transition hover:border-red-400/70 hover:bg-red-500/15"
              aria-label="Bajar línea"
            >
              −
            </button>
            <select
              value={lineValue.toFixed(1)}
              onChange={(e) => setLineValue(toBetLine(Number(e.target.value)))}
              className="w-full rounded-xl border border-white/10 bg-[#07131a] px-3 py-2 text-2xl font-black text-white outline-none focus:border-[#22c55e]/70"
            >
              {lineOptions.map((line) => (
                <option key={line.toFixed(1)} value={line.toFixed(1)}>
                  {line.toFixed(1)}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => moveLine(1)}
              className="rounded-xl border border-white/10 bg-[#07131a] text-xl font-black text-white transition hover:border-emerald-400/70 hover:bg-emerald-500/15"
              aria-label="Subir línea"
            >
              +
            </button>
          </div>
        </div>

        <div className="rounded-2xl border p-3" style={filterCardStyle(theme)}>
          <p className="text-[8px] font-black uppercase tracking-widest" style={{ color: theme.primary }}>Rival</p>
          <select value={opponent} onChange={(e) => setOpponent(e.target.value)} className={selectClass()}>
            <option value="ALL">Todos</option>
            {opponents.map((opp) => (
              <option key={opp} value={opp}>{opp}</option>
            ))}
          </select>
        </div>

        <div className="rounded-2xl border p-3" style={filterCardStyle(theme)}>
          <p className="text-[8px] font-black uppercase tracking-widest" style={{ color: theme.primary }}>Localía</p>
          <select value={homeAway} onChange={(e) => setHomeAway(e.target.value)} className={selectClass()}>
            <option value="ALL">Todos</option>
            <option value="HOME">Local</option>
            <option value="AWAY">Visitante</option>
          </select>
        </div>

        <div className="rounded-2xl border p-3" style={filterCardStyle(theme)}>
          <p className="text-[8px] font-black uppercase tracking-widest" style={{ color: theme.primary }}>Minutos</p>
          <select value={minMinutes} onChange={(e) => setMinMinutes(Number(e.target.value))} className={selectClass()}>
            <option value={0}>Todos</option>
            <option value={20}>MIN ≥ 20</option>
            <option value={25}>MIN ≥ 25</option>
            <option value={30}>MIN ≥ 30</option>
            <option value={35}>MIN ≥ 35</option>
          </select>
        </div>

        <div className="rounded-2xl border p-3" style={filterCardStyle(theme)}>
          <p className="text-[8px] font-black uppercase tracking-widest" style={{ color: theme.primary }}>Lado</p>
          <div className="mt-2 grid grid-cols-2 gap-1 rounded-xl border border-white/10 bg-[#07131a] p-1">
            {(["over", "under"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setSide(v)}
                className="rounded-lg px-2 py-2 text-[9px] font-black uppercase"
                style={{
                  background: side === v ? (v === "over" ? "#22c55e" : "#ef4444") : "transparent",
                  color: side === v ? "#050505" : "rgb(148 163 184)",
                }}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-5">
        <span className="inline-flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)] mr-1">
          <Filter size={12} /> Partidos
        </span>
        {LAST_N.map((n) => {
          const active = lastN === n;
          return (
            <button
              key={n}
              type="button"
              onClick={() => setLastN(n)}
              className="rounded-xl border px-3 py-2 text-[10px] font-black uppercase tracking-widest"
              style={{ borderColor: active ? theme.primary : "rgba(148,163,184,.22)", background: active ? theme.primary : "rgba(2,6,12,.72)", color: active ? theme.text : "rgb(148 163 184)" }}
            >
              {n === 0 ? "Todos" : `L${n}`}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
        <Metric label={`AVG ${stat.label}`} value={fmt(summary.avg)} color={activeColor} />
        <Metric label="Partidos" value={String(summary.games)} color={theme.secondary} />
        <Metric label="Hits" value={`${summary.hits}/${summary.games}`} color={theme.primary} />
        <Metric label="Hit rate" value={`${fmt(summary.hitRate)}%`} color={summary.hitRate >= 50 ? "#22c55e" : "#ef4444"} />
        <Metric label="Máx / Mín" value={`${fmt(summary.high)} / ${fmt(summary.low)}`} color="#e5e7eb" />
      </div>

      <div className="rounded-[1.35rem] border border-white/10 bg-[#03070c] p-3 md:p-4 min-w-0 overflow-hidden">
        <WNBAColorBars rows={chartRows} statLabel={stat.label} lineValue={lineValue} side={side} />
      </div>

      <div className="mt-5 rounded-[1.35rem] border border-white/10 bg-[#03070c] overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <p className="text-[10px] font-black uppercase tracking-[0.25em] flex items-center gap-2" style={{ color: theme.primary }}>
            <ListFilter size={13} /> Game log filtrado
          </p>
          <p className="text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)]">{summary.games} filas</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[780px] text-left">
            <thead className="text-[9px] uppercase tracking-widest text-[var(--text-muted)]">
              <tr className="border-b border-white/10">
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3">Partido</th>
                <th className="px-4 py-3 text-right">MIN</th>
                <th className="px-4 py-3 text-right">PTS</th>
                <th className="px-4 py-3 text-right">REB</th>
                <th className="px-4 py-3 text-right">AST</th>
                <th className="px-4 py-3 text-right">PRA</th>
                <th className="px-4 py-3 text-right">3PM</th>
                <th className="px-4 py-3 text-right">{stat.label}</th>
              </tr>
            </thead>
            <tbody className="text-xs font-black">
              {filtered.map((row, index) => {
                const hit = side === "under" ? num(row.value) < lineValue : num(row.value) > lineValue;
                return (
                  <tr key={`${row.game_id || row.game_date}-${index}`} className="border-b border-white/10 hover:bg-white/[0.035]">
                    <td className="px-4 py-3 text-[var(--text-muted)]">{dateOnly(row.game_date)}</td>
                    <td className="px-4 py-3 uppercase">{row.matchup || getGameLabel(row)}</td>
                    <td className="px-4 py-3 text-right">{fmt(minutesNum(row.min ?? row.minutes))}</td>
                    <td className="px-4 py-3 text-right">{num(row.pts)}</td>
                    <td className="px-4 py-3 text-right">{num(row.reb)}</td>
                    <td className="px-4 py-3 text-right">{num(row.ast)}</td>
                    <td className="px-4 py-3 text-right" style={{ color: activeColor }}>{num(row.pts) + num(row.reb) + num(row.ast)}</td>
                    <td className="px-4 py-3 text-right">{num(row.fg3m)}</td>
                    <td className="px-4 py-3 text-right" style={{ color: hit ? "#22c55e" : "#ef4444" }}>{fmt(num(row.value))}</td>
                  </tr>
                );
              })}
              {!filtered.length && (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-[var(--text-muted)] uppercase tracking-widest">
                    Sin partidos para esos filtros
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function WNBAColorBars({ rows, statLabel, lineValue, side }: { rows: any[]; statLabel: string; lineValue: number; side: "over" | "under" }) {
  const values = rows.map((r) => num(r.value));
  const maxValue = Math.max(lineValue, ...values, 1);
  const lineTop = Math.max(4, Math.min(94, 100 - (lineValue / maxValue) * 100));

  return (
    <div className="relative h-[280px] min-w-[720px] rounded-2xl bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,.055),transparent_35%)] px-4 pt-7 pb-12">
      <div className="absolute left-4 right-4 border-t border-dashed border-white/35" style={{ top: `${lineTop}%` }}>
        <span className="absolute -top-3 right-0 rounded-full border border-white/10 bg-[#07131a] px-2 py-0.5 text-[8px] font-black uppercase tracking-widest text-white">
          Línea {lineValue.toFixed(1)}
        </span>
      </div>
      <div className="flex h-full items-end gap-2">
        {rows.map((row, idx) => {
          const value = num(row.value);
          const height = Math.max(7, (value / maxValue) * 100);
          const hit = side === "under" ? value < lineValue : value > lineValue;
          const barColor = hit ? "#22c55e" : "#ef4444";
          return (
            <div key={`${row.game_id || row.game_date}-${idx}`} className="group relative flex h-full min-w-[54px] flex-1 flex-col items-center justify-end gap-2">
              <div className="absolute -top-1 hidden rounded-xl border border-white/10 bg-[#07131a] px-3 py-2 text-[10px] font-black uppercase text-white shadow-xl group-hover:block">
                <div>{row.matchup || getGameLabel(row)}</div>
                <div className="mt-1" style={{ color: barColor }}>{statLabel}: {fmt(value)}</div>
              </div>
              <div className="text-[10px] font-black" style={{ color: barColor }}>{fmt(value, value >= 10 ? 0 : 1)}</div>
              <div
                className="w-full rounded-t-xl border border-white/10 transition-all group-hover:brightness-125"
                style={{ height: `${height}%`, background: `linear-gradient(180deg, ${barColor}, ${barColor}66)`, boxShadow: `0 0 18px ${barColor}33` }}
              />
              <div className="absolute bottom-[-2rem] w-full text-center">
                <p className="text-[9px] font-black uppercase text-[var(--text-muted)]">{getOpponent(row)}</p>
                <p className="mt-0.5 text-[8px] font-black uppercase text-white/40">{String(row.wl || "").slice(0, 1)}</p>
              </div>
            </div>
          );
        })}
        {!rows.length && (
          <div className="flex h-full w-full items-center justify-center text-xs font-black uppercase tracking-widest text-[var(--text-muted)]">
            Sin datos para graficar
          </div>
        )}
      </div>
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
