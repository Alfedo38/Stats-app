"use client";

import { useEffect, useMemo, useState } from "react";
import { formatDateOnly, formatMinutes, formatNumber, formatPercent, formatSeasonLabel } from "@/lib/formatters";
import { History, Loader2, ShieldCheck, Table2 } from "lucide-react";

type Props = {
  playerId?: string | number | null;
  playerName: string;
  activeStat: string;
  activeStatLabel: string;
  lineValue: number;
  side?: "over" | "under";
  minMinutes?: number | null;
  opponent?: string | null;
  homeAway?: "HOME" | "AWAY" | string | null;
  woTeammate?: string | null;
  externalFilterCount?: number;
  initialData?: HistoryResponse | null;
  initialLoading?: boolean;
  initialError?: string | null;
};

type HistoryResponse = {
  ok: boolean;
  error?: string;
  side?: "over" | "under";
  market?: string;
  line?: number;
  opponent?: string | null;
  homeAway?: "HOME" | "AWAY" | null;
  minMinutes?: number | null;
  coverage?: {
    from: string | null;
    to: string | null;
    games: number;
    seasons: string[];
    selectedSeasons: string[];
  };
  summary?: any;
  recent?: any;
  opponentSummary?: any;
  seasonBreakdown?: any[];
  games?: any[];
  source?: string;
  matchMode?: string;
};

const STAT_TO_MARKET: Record<string, string> = {
  pts: "PTS",
  reb: "REB",
  ast: "AST",
  fgm: "FGM",
  fga: "FGA",
  fg3m: "3PTM",
  "3pt": "3PTM",
  "3ptm": "3PTM",
  fg3a: "3PTA",
  "3pta": "3PTA",
  blk: "BLK",
  stl: "STL",
  "stl+blk": "STL+BLK",
  tov: "TO",
  to: "TO",
  pf: "PF",
  "pts+reb+ast": "PRA",
  pra: "PRA",
  "pts+reb": "PR",
  pr: "PR",
  "pts+ast": "PA",
  pa: "PA",
  "reb+ast": "RA",
  ra: "RA",
};

const TABLE_COLUMNS = [
  { key: "pts", label: "PTS" },
  { key: "reb", label: "REB" },
  { key: "ast", label: "AST" },
  { key: "pra", label: "PRA" },
  { key: "fgm", label: "FGM" },
  { key: "fga", label: "FGA" },
  { key: "fg3m", label: "3PTM" },
  { key: "fg3a", label: "3PTA" },
  { key: "blk", label: "BLK" },
  { key: "stl", label: "STL" },
  { key: "stl_blk", label: "S+B" },
  { key: "tov", label: "TO" },
  { key: "pf", label: "PF" },
  { key: "usage_pct", label: "USG" },
  { key: "touches", label: "TCH" },
];

function toMarket(stat: string) {
  return STAT_TO_MARKET[String(stat || "").toLowerCase()] || null;
}

function pct(value: any) {
  return formatPercent(value, 1).replace("—", "S/D");
}

function fmt(value: any, digits = 1) {
  return formatNumber(value, digits);
}

function fmtUsage(value: any) {
  if (value === null || value === undefined || value === "") return "—";
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return "—";
  return `${(n <= 1 ? n * 100 : n).toFixed(1)}%`;
}

function dateShort(value: any) {
  return formatDateOnly(value, { year: true });
}

function hitTone(rate: any): "green" | "red" | "yellow" | "default" {
  const n = Number(rate);
  if (!Number.isFinite(n)) return "default";
  if (n >= 60) return "green";
  if (n < 45) return "red";
  return "yellow";
}

function SummaryCard({ label, value, sub, tone = "default" }: { label: string; value: string; sub?: string; tone?: "green" | "red" | "yellow" | "default" }) {
  const color = tone === "green" ? "text-[#10b981]" : tone === "red" ? "text-red-400" : tone === "yellow" ? "text-yellow-300" : "text-[var(--text)]";
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-3 min-w-0">
      <p className="text-[8px] font-black uppercase tracking-widest text-[var(--text-muted)] truncate">{label}</p>
      <p className={`mt-1 text-xl font-black tabular-nums ${color}`}>{value}</p>
      {sub && <p className="mt-1 text-[9px] font-bold uppercase tracking-widest text-[var(--text-muted)] truncate">{sub}</p>}
    </div>
  );
}

function activeFiltersText({ side, minMinutes, opponent, homeAway, woTeammate }: Pick<Props, "side" | "minMinutes" | "opponent" | "homeAway" | "woTeammate">) {
  const parts = [side?.toUpperCase() || "OVER"];
  if (minMinutes) parts.push(`MIN ≥ ${minMinutes}`);
  if (homeAway === "HOME") parts.push("LOCAL");
  if (homeAway === "AWAY") parts.push("VISITANTE");
  if (opponent) parts.push(`VS ${String(opponent).toUpperCase()}`);
  if (woTeammate) parts.push(`W/O ${String(woTeammate).toUpperCase()}`);
  return parts.join(" · ");
}

export default function PlayerHistoricalExplorer({
  playerId,
  playerName,
  activeStat,
  activeStatLabel,
  lineValue,
  side = "over",
  minMinutes = null,
  opponent = null,
  homeAway = null,
  woTeammate = null,
  externalFilterCount = 0,
  initialData = undefined,
  initialLoading = undefined,
  initialError = null,
}: Props) {
  const market = useMemo(() => toMarket(activeStat), [activeStat]);
  const normalizedOpponent = String(opponent || "").trim().toUpperCase() || null;
  const normalizedHomeAway = String(homeAway || "").toUpperCase() === "HOME" ? "HOME" : String(homeAway || "").toUpperCase() === "AWAY" ? "AWAY" : null;
  const [data, setData] = useState<HistoryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialData !== undefined || initialLoading !== undefined) {
      setData(initialData ?? null);
      setLoading(Boolean(initialLoading));
      setError(initialError || null);
      return;
    }

    if (!market || !playerName || !Number.isFinite(Number(lineValue))) {
      setData(null);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError(null);

    fetch("/api/player-history", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        playerId,
        playerName,
        market,
        line: Number(lineValue),
        side,
        mode: "all",
        opponent: normalizedOpponent,
        homeAway: normalizedHomeAway,
        minMinutes,
        woTeammate,
        limit: 1000,
      }),
      signal: controller.signal,
    })
      .then((r) => r.json().then((json) => ({ ok: r.ok, json })))
      .then(({ ok, json }) => {
        if (!ok || json?.ok === false) throw new Error(json?.error || "Error consultando histórico");
        setData(json);
      })
      .catch((err) => {
        if (err?.name === "AbortError") return;
        setError(err?.message || "Error consultando histórico");
        setData(null);
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [initialData, initialLoading, initialError, playerId, playerName, market, lineValue, side, normalizedOpponent, normalizedHomeAway, minMinutes, woTeammate]);

  if (!market) {
    return (
      <section className="rounded-[1.5rem] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-xl">
        <div className="flex items-center gap-2 text-[var(--text-muted)]">
          <History size={16} />
          <p className="text-[10px] font-black uppercase tracking-widest">Histórico largo no disponible para {activeStatLabel}</p>
        </div>
      </section>
    );
  }

  const summary = data?.summary;
  const games = data?.games || [];
  const hasSample = Number(summary?.games || 0) > 0;
  const hitRatePct = summary?.hitRatePct;
  const coverageText = data?.coverage?.from && data?.coverage?.to
    ? `${data.coverage.from} → ${data.coverage.to}`
    : "Sin cobertura";
  const selectedSeasons = data?.coverage?.selectedSeasons?.map((s) => formatSeasonLabel(s)).join(" · ") || "S/D";
  const sampleQuality = Number(summary?.games || 0) >= 20 ? "muestra fuerte" : Number(summary?.games || 0) >= 8 ? "muestra media" : "muestra baja";

  return (
    <section className="rounded-[1.5rem] border border-[var(--border)] bg-[var(--surface)] p-4 md:p-5 shadow-2xl min-w-0">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-xl bg-[#10b981]/10 border border-[#10b981]/25 flex items-center justify-center">
              <Table2 size={16} className="text-[#10b981]" />
            </div>
            <div className="min-w-0">
              <p className="text-[8px] font-black uppercase tracking-[0.24em] text-[#10b981]">Tabla única histórica</p>
              <h3 className="text-base md:text-xl font-black text-[var(--text)] uppercase tracking-tight truncate">
                {playerName} · {market} {fmt(lineValue)} · {activeFiltersText({ side, minMinutes, opponent: normalizedOpponent, homeAway: normalizedHomeAway, woTeammate })}
              </h3>
            </div>
          </div>
          <p className="mt-2 text-[11px] font-bold text-[var(--text-muted)]">
            Una sola muestra. Los filtros globales de arriba alimentan gráfico, resumen y tabla. USG/TOUCHES aparecen como datos extra cuando existen.
            {woTeammate ? ` Filtro W/O activo: sin ${woTeammate}.` : externalFilterCount > 0 ? " Hay filtros externos activos desde el panel de lesiones." : ""}
          </p>
        </div>

        <div className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">
          {loading ? <Loader2 size={13} className="animate-spin" /> : <ShieldCheck size={13} className="text-[#10b981]" />}
          {loading ? "Calculando" : selectedSeasons}
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs font-bold text-red-300">
          {error}
        </div>
      )}

      {!error && !loading && !hasSample && (
        <div className="mt-4 rounded-2xl border border-yellow-500/30 bg-yellow-500/10 p-4">
          <p className="text-sm font-black uppercase tracking-widest text-yellow-300">Sin muestra suficiente</p>
          <p className="mt-2 text-xs font-bold text-[var(--text-muted)]">
            No muestro 0.000 como si fuera en contra. Probá sacar MIN, limpiar rival o cambiar local/visitante.
          </p>
        </div>
      )}

      {hasSample && (
        <>
          <div className="mt-4 grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3">
            <SummaryCard label="Muestra" value={String(summary.games)} sub={`completo · ${sampleQuality}`} tone={summary.games >= 20 ? "green" : summary.games >= 8 ? "yellow" : "red"} />
            <SummaryCard label="Hit rate" value={pct(hitRatePct)} sub={`${summary.hits}/${summary.games}`} tone={hitTone(hitRatePct)} />
            <SummaryCard label="Promedio" value={fmt(summary.avg)} sub={market} />
            <SummaryCard label="Mediana" value={fmt(summary.median)} sub="valor central" />
            <SummaryCard label="Min prom." value={formatMinutes(summary.avgMinutes)} sub={minMinutes ? `MIN ≥ ${minMinutes}` : "sin filtro"} />
            <SummaryCard label="Cobertura" value={String(data?.coverage?.games || 0)} sub={coverageText} />
          </div>

          {data?.recent && (
            <div className="mt-4 rounded-2xl border border-cyan-400/20 bg-cyan-400/[0.035] p-4">
              <div className="mb-3 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-cyan-300">
                <History size={13} /> L5 / L10 / L20 / L30 sobre la misma muestra filtrada
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {[
                  ["L5", data.recent.l5],
                  ["L10", data.recent.l10],
                  ["L20", data.recent.l20],
                  ["L30", data.recent.l30],
                ].map(([label, item]: any) => (
                  <SummaryCard
                    key={label}
                    label={label}
                    value={item?.games ? pct(item.hitRatePct) : "S/D"}
                    sub={item?.games ? `${item.hits}/${item.games} · AVG ${fmt(item.avg)}` : "sin muestra"}
                    tone={hitTone(item?.hitRatePct)}
                  />
                ))}
              </div>
            </div>
          )}

          {data?.source && (
            <div className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)]">
              Fuente: {String(data.source).replace("nba_api_data.", "")} · Match: {data.matchMode || "S/D"}
            </div>
          )}

          {!!data?.seasonBreakdown?.length && (
            <div className="mt-4 rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-4">
              <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)] mb-3">
                <Table2 size={13} className="text-[#10b981]" /> Por temporada
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
                {data.seasonBreakdown.slice(0, 12).map((s) => (
                  <div key={s.season} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 grid grid-cols-4 items-center gap-2 text-xs">
                    <span className="font-black text-[var(--text)]">{formatSeasonLabel(s.season)}</span>
                    <span className="font-bold text-[var(--text-muted)]">{s.games} j</span>
                    <span className={`font-black tabular-nums ${hitTone(s.hitRatePct) === "green" ? "text-[#10b981]" : hitTone(s.hitRatePct) === "red" ? "text-red-400" : "text-yellow-300"}`}>{pct(s.hitRatePct)}</span>
                    <span className="font-bold text-[var(--text-muted)]">AVG {fmt(s.avg)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <details open className="mt-4 rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-4">
            <summary className="cursor-pointer text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)] hover:text-[var(--text)] transition-colors">
              Ver tabla completa filtrada ({games.length})
            </summary>
            <div className="mt-3 max-h-[460px] overflow-auto rounded-xl border border-[var(--border)]">
              <table className="w-full min-w-[1280px] text-xs">
                <thead className="sticky top-0 z-10 bg-[var(--bg)] text-[9px] uppercase tracking-widest text-[var(--text-muted)]">
                  <tr className="border-b border-[var(--border)]">
                    <th className="px-3 py-2 text-left">Fecha</th>
                    <th className="px-3 py-2 text-left">Temp.</th>
                    <th className="px-3 py-2 text-left">Matchup</th>
                    <th className="px-3 py-2 text-left">Loc.</th>
                    <th className="px-3 py-2 text-right">MIN</th>
                    <th className="px-3 py-2 text-right">{market}</th>
                    {TABLE_COLUMNS.filter((col) => col.label !== market).map((col) => (
                      <th key={col.key} className="px-3 py-2 text-right">{col.label}</th>
                    ))}
                    <th className="px-3 py-2 text-right">Hit</th>
                  </tr>
                </thead>
                <tbody>
                  {games.map((g, i) => (
                    <tr key={`${g.game_id || g.game_date}-${i}`} className="border-b border-[var(--border)]/60 hover:bg-[var(--surface)]/70 transition-colors">
                      <td className="px-3 py-2 font-bold text-[var(--text-muted)]">{dateShort(g.game_date)}</td>
                      <td className="px-3 py-2 font-bold text-[var(--text-muted)]">{formatSeasonLabel(g.season_id, g.game_date)}</td>
                      <td className="px-3 py-2 font-black text-[var(--text)]">{g.matchup_clean || g.matchup || `vs ${g.opponent_clean || g.opponent || "S/D"}`}</td>
                      <td className="px-3 py-2 font-bold text-[var(--text-muted)]">{g.home_away_clean || g.home_away || "—"}</td>
                      <td className="px-3 py-2 text-right font-bold tabular-nums">{g.min_display || formatMinutes(g.minutes)}</td>
                      <td className="px-3 py-2 text-right font-black tabular-nums text-[#10b981]">{fmt(g.value)}</td>
                      {TABLE_COLUMNS.filter((col) => col.label !== market).map((col) => (
                        <td key={col.key} className="px-3 py-2 text-right font-bold tabular-nums">
                          {col.key === "usage_pct" ? fmtUsage(g[col.key]) : col.key === "touches" ? fmt(g[col.key], 0) : fmt(g[col.key], 0)}
                        </td>
                      ))}
                      <td className={`px-3 py-2 text-right font-black ${g.hit ? "text-[#10b981]" : "text-red-400"}`}>{g.hit ? "✓" : "×"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </section>
  );
}
