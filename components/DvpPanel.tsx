"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type DvpMetric = {
  key: string;
  label: string;
  value: number | null;
  leagueAvg: number | null;
  diff: number | null;
  favorable: boolean | null;
};

type DvpResponse = {
  ok: boolean;
  team?: string;
  requestedPosition?: string;
  positionGroup?: string;
  resolvedPositionGroup?: string;
  positionLabel?: string;
  found?: boolean;
  updatedAt?: string | null;
  message?: string;
  metrics?: DvpMetric[];
  error?: string;
};

type DvpPanelProps = {
  opponentAbbr: string;
  position: string;
};

function fmt(value: unknown, digits = 1) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return n.toFixed(digits).replace(/\.0$/, "");
}

function normalizePositionForLabel(position: string | null | undefined) {
  const raw = String(position || "").trim().toUpperCase();
  if (!raw) return "G";
  if (["PG", "SG", "G", "POINT GUARD", "SHOOTING GUARD", "GUARD"].includes(raw)) return "G";
  if (["SF", "PF", "F", "SMALL FORWARD", "POWER FORWARD", "FORWARD"].includes(raw)) return "F";
  if (["C", "CENTER", "CENTRE"].includes(raw)) return "C";
  if (["G-F", "F-G", "GF", "FG", "GUARD-FORWARD", "FORWARD-GUARD"].includes(raw)) return "G-F";
  if (["F-C", "C-F", "FC", "CF", "FORWARD-CENTER", "CENTER-FORWARD"].includes(raw)) return "F-C";
  if (raw.includes("GUARD")) return "G";
  if (raw.includes("CENTER")) return "C";
  if (raw.includes("FORWARD")) return "F";
  return raw;
}

function positionLabel(group?: string) {
  switch (group) {
    case "G": return "Guards";
    case "F": return "Forwards";
    case "C": return "Centers";
    case "G-F": return "Wings";
    case "F-C": return "Bigs";
    default: return group || "Posición";
  }
}

export default function DvpPanel({ opponentAbbr, position }: DvpPanelProps) {
  const [data, setData] = useState<DvpResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const requestSeq = useRef(0);

  const team = String(opponentAbbr || "").trim().toUpperCase();
  const positionGroup = useMemo(() => normalizePositionForLabel(position), [position]);

  useEffect(() => {
    const seq = ++requestSeq.current;
    const controller = new AbortController();

    async function run() {
      if (!team) {
        setData(null);
        return;
      }

      // Important: clear stale panel immediately so a previous player/rival does not stay visible.
      setData(null);
      setLoading(true);
      try {
        const res = await fetch(`/api/dvp?team=${encodeURIComponent(team)}&position=${encodeURIComponent(positionGroup)}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const json = await res.json();
        if (seq === requestSeq.current) setData(json);
      } catch (error: any) {
        if (error?.name !== "AbortError" && seq === requestSeq.current) {
          setData({ ok: false, error: "fetch_failed" });
        }
      } finally {
        if (seq === requestSeq.current) setLoading(false);
      }
    }

    run();
    return () => controller.abort();
  }, [team, positionGroup]);

  if (!team) return null;

  const metrics = data?.metrics || [];
  const label = data?.positionLabel || positionLabel(data?.resolvedPositionGroup || positionGroup);

  if (!loading && data?.ok === false) {
    return (
      <section className="rounded-3xl border border-red-500/20 bg-black/30 p-4">
        <div className="text-[10px] font-black uppercase tracking-[0.25em] text-red-300">Defensa vs posición</div>
        <div className="mt-1 text-sm font-black text-white">DVP no disponible</div>
      </section>
    );
  }

  return (
    <section
      key={`${team}-${positionGroup}`}
      className="rounded-3xl border border-emerald-400/20 bg-black/35 p-4 shadow-[0_0_28px_rgba(16,185,129,0.05)]"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.25em] text-emerald-300">Defensa vs posición</div>
          <h3 className="mt-1 text-lg font-black uppercase text-white">
            {team} <span className="text-slate-500">vs</span> {label}
          </h3>
        </div>
        <div className="rounded-full border border-cyan-400/20 px-3 py-1 text-[9px] font-black uppercase tracking-widest text-cyan-200">
          Liga avg
        </div>
      </div>

      {loading ? (
        <div className="mt-5 grid grid-cols-2 md:grid-cols-4 gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-2xl border border-slate-700/60 bg-slate-900/40" />
          ))}
        </div>
      ) : data?.found && metrics.length > 0 ? (
        <div className="mt-5 grid grid-cols-2 md:grid-cols-4 gap-2">
          {metrics.map((m) => {
            const favorable = m.favorable === true;
            const diffText = m.diff == null ? "—" : `${m.diff > 0 ? "+" : ""}${fmt(m.diff)}`;

            return (
              <div
                key={m.key}
                className={[
                  "rounded-2xl border p-3",
                  favorable
                    ? "border-emerald-400/30 bg-emerald-400/8"
                    : "border-red-400/25 bg-red-400/7",
                ].join(" ")}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">{m.label}</div>
                  <div className={favorable ? "text-[9px] font-black text-emerald-300" : "text-[9px] font-black text-red-300"}>
                    {favorable ? "FAV" : "DURO"}
                  </div>
                </div>

                <div className="mt-2 text-2xl font-black text-white">{fmt(m.value)}</div>

                <div className="mt-1 flex items-center justify-between gap-2 text-[10px] font-bold text-slate-400">
                  <span>liga {fmt(m.leagueAvg)}</span>
                  <span className={favorable ? "text-emerald-300" : "text-red-300"}>{diffText}</span>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="mt-5 rounded-2xl border border-slate-700/60 bg-slate-950/50 p-4 text-center text-xs font-black uppercase tracking-widest text-slate-400">
          Sin datos para {team} · {label}
        </div>
      )}

      <p className="mt-3 text-[10px] font-bold leading-relaxed text-slate-500">
        DVP usa el rival actual o filtrado y la posición del jugador. Si no existe grupo exacto, usa el grupo más cercano.
      </p>
    </section>
  );
}
