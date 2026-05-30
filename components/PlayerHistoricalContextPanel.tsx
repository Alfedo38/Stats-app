"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, BarChart3, History, Loader2, ShieldCheck, TrendingUp } from "lucide-react";

type HistContext = {
  summary?: Record<string, any>;
  buckets?: Array<Record<string, any>>;
  [key: string]: any;
};

type ApiState = {
  over: HistContext | null;
  under: HistContext | null;
} | null;

type Props = {
  playerName: string;
  activeStat: string;
  activeStatLabel: string;
  lineValue: number;
  opponent?: string | null;
  homeAway?: "HOME" | "AWAY" | string | null;
  asOfDate?: string | null;
};

const STAT_TO_MARKET: Record<string, string> = {
  pts: "PTS",
  reb: "REB",
  ast: "AST",
  fg3m: "3PT",
  "3pt": "3PT",
  "3ptm": "3PT",
  "pts+reb+ast": "PRA",
  pra: "PRA",
  "pts+reb": "PR",
  pr: "PR",
  "pts+ast": "PA",
  pa: "PA",
  "reb+ast": "RA",
  ra: "RA",
};

function toMarket(stat: string) {
  return STAT_TO_MARKET[String(stat || "").toLowerCase()] || null;
}

function rateToPct(value: any) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "S/D";
  const pct = n <= 1 ? n * 100 : n;
  return `${pct.toFixed(1)}%`;
}

function scoreToText(value: any) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "S/D";
  return n.toFixed(3);
}

function gradeClass(grade?: string) {
  const g = String(grade || "").toUpperCase();
  if (g.includes("FUERTE") || g.includes("BET") || g.includes("ALTO")) return "text-[#10b981] border-[#10b981]/35 bg-[#10b981]/10";
  if (g.includes("NO") || g.includes("BAJO") || g.includes("ROJO")) return "text-red-400 border-red-500/35 bg-red-500/10";
  if (g.includes("NEUTRO") || g.includes("REVIS")) return "text-yellow-300 border-yellow-500/35 bg-yellow-500/10";
  return "text-[var(--text)] border-[var(--border)] bg-[var(--surface-soft)]";
}

function summaryOf(ctx: HistContext | null | undefined) {
  return ctx?.summary || null;
}

function bucketLabel(bucket: Record<string, any>) {
  return String(bucket.bucket || bucket.label || bucket.name || "Bucket").replace(/_/g, " ");
}

function bucketRate(bucket: Record<string, any>) {
  return bucket.hit_rate ?? bucket.rate ?? bucket.over_rate ?? bucket.under_rate ?? null;
}

function bucketGames(bucket: Record<string, any>) {
  return bucket.games ?? bucket.n ?? bucket.sample ?? bucket.count ?? null;
}

function ContextSideCard({ side, context }: { side: "over" | "under"; context: HistContext | null }) {
  const summary = summaryOf(context);
  const grade = summary?.hist_grade || "S/D";
  const score = summary?.hist_score;

  const sideLabel = side === "over" ? "Over" : "Under";
  const sideColor = side === "over" ? "text-[#10b981]" : "text-red-400";

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-xl min-w-0">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[8px] font-black uppercase tracking-[0.22em] text-[var(--text-muted)]">
            Histórico {sideLabel}
          </p>
          <p className={`mt-1 text-2xl font-black ${sideColor}`}>{scoreToText(score)}</p>
        </div>
        <div className={`rounded-xl border px-3 py-2 text-[10px] font-black uppercase tracking-widest ${gradeClass(grade)}`}>
          {grade}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 text-[10px] font-black uppercase tracking-widest">
        <Metric label="L5" value={rateToPct(summary?.l5_rate)} />
        <Metric label="L10" value={rateToPct(summary?.l10_rate)} />
        <Metric label="Vs Rival" value={rateToPct(summary?.vs_opp_rate)} />
        <Metric label="Home/Away" value={rateToPct(summary?.home_away_rate)} />
        <Metric label="Global" value={rateToPct(summary?.all_rate)} />
        <Metric label="Edge" value={scoreToText(summary?.avg_edge)} />
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2">
      <p className="text-[7px] text-[var(--text-muted)]">{label}</p>
      <p className="mt-1 text-sm text-[var(--text)] tabular-nums">{value}</p>
    </div>
  );
}

export default function PlayerHistoricalContextPanel({
  playerName,
  activeStat,
  activeStatLabel,
  lineValue,
  opponent,
  homeAway,
  asOfDate,
}: Props) {
  const market = useMemo(() => toMarket(activeStat), [activeStat]);
  const [data, setData] = useState<ApiState>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!market || !playerName || !Number.isFinite(Number(lineValue))) {
      setData(null);
      setError(null);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError(null);

    fetch("/api/hist-context", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        playerName,
        market,
        line: Number(lineValue),
        opponent: opponent || null,
        homeAway: homeAway || null,
        asOfDate: asOfDate || null,
      }),
      signal: controller.signal,
    })
      .then((res) => res.json().then((json) => ({ ok: res.ok, json })))
      .then(({ ok, json }) => {
        if (!ok || json?.ok === false) throw new Error(json?.error || "Error consultando histórico");
        setData(json.histContext || null);
      })
      .catch((err) => {
        if (err?.name === "AbortError") return;
        setError(err?.message || "Error consultando histórico");
        setData(null);
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [playerName, market, lineValue, opponent, homeAway, asOfDate]);

  if (!market) {
    return (
      <div className="rounded-[2rem] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-xl">
        <div className="flex items-center gap-2 text-[var(--text-muted)]">
          <History size={16} />
          <p className="text-[10px] font-black uppercase tracking-widest">
            Histórico 5 años no disponible para {activeStatLabel}
          </p>
        </div>
      </div>
    );
  }

  const overSummary = summaryOf(data?.over);
  const underSummary = summaryOf(data?.under);
  const explanation = overSummary?.explanation_base || underSummary?.explanation_base || null;
  const buckets = data?.over?.buckets || data?.under?.buckets || [];

  return (
    <section className="rounded-[2rem] border border-[var(--border)] bg-[var(--surface)] p-4 md:p-5 shadow-2xl min-w-0">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-xl bg-[#10b981]/10 border border-[#10b981]/25 flex items-center justify-center">
              <History size={16} className="text-[#10b981]" />
            </div>
            <div>
              <p className="text-[8px] font-black uppercase tracking-[0.24em] text-[#10b981]">
                Histórico 5 años
              </p>
              <h3 className="text-lg md:text-xl font-black text-[var(--text)] uppercase tracking-tight">
                {market} {Number(lineValue).toFixed(Number.isInteger(lineValue) ? 0 : 1)} · {playerName}
              </h3>
            </div>
          </div>
          <p className="mt-2 text-[11px] font-bold text-[var(--text-muted)]">
            Base histórica: L5/L10, vs rival, local/visitante y global. {opponent ? `Rival: ${opponent}. ` : ""}{homeAway ? `Condición: ${homeAway}.` : ""}
          </p>
        </div>

        <div className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">
          {loading ? <Loader2 size={13} className="animate-spin" /> : <ShieldCheck size={13} className="text-[#10b981]" />}
          {loading ? "Calculando" : "Sin fuga de datos"}
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs font-bold text-red-300 flex items-center gap-2">
          <AlertTriangle size={14} /> {error}
        </div>
      )}

      {!error && (
        <div className="mt-4 grid grid-cols-1 xl:grid-cols-2 gap-3">
          <ContextSideCard side="over" context={data?.over || null} />
          <ContextSideCard side="under" context={data?.under || null} />
        </div>
      )}

      {explanation && (
        <div className="mt-4 rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-4">
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">
            <TrendingUp size={13} className="text-[#10b981]" /> Lectura histórica
          </div>
          <p className="mt-2 text-sm leading-relaxed text-[var(--text)] font-semibold">
            {explanation}
          </p>
        </div>
      )}

      {buckets.length > 0 && (
        <div className="mt-4 rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-4">
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)] mb-3">
            <BarChart3 size={13} className="text-[#10b981]" /> Buckets
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            {buckets.slice(0, 10).map((bucket, index) => (
              <div key={`${bucketLabel(bucket)}-${index}`} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2">
                <p className="text-[7px] font-black uppercase tracking-widest text-[var(--text-muted)] truncate">
                  {bucketLabel(bucket)}
                </p>
                <p className="mt-1 text-sm font-black text-[var(--text)] tabular-nums">
                  {rateToPct(bucketRate(bucket))}
                </p>
                <p className="mt-0.5 text-[8px] font-bold text-[var(--text-muted)]">
                  {bucketGames(bucket) ?? "S/D"} juegos
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
