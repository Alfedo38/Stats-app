"use client";

import { useMemo } from "react";
import { TrendingUp, RefreshCw } from "lucide-react";

// ─── Types ─────────────────────────────────────────────────────────────────────

export type BookOdd = {
  book: string;
  line: number;
  over_price: number | null;
  under_price: number | null;
  source?: string;
  updated_at?: string | null;
};

interface OddsComparisonTableProps {
  odds: BookOdd[];
  lineValue: number;          // active line from PlayerChartContainer
  statLabel: string;          // e.g. "PTS"
  hitRate?: number;           // 0-100 — used for +EV detection
  avgValue?: number;          // used for edge calc
}

// ─── Book display config ───────────────────────────────────────────────────────
// Maps raw book names from DB to display names + logo emoji
// Add / edit entries to match your actual book names in the DB

const BOOK_CONFIG: Record<string, { label: string; emoji: string }> = {
  stake:       { label: "Stake",       emoji: "🟢" },
  betano:      { label: "Betano",      emoji: "🟠" },
  betmgm:      { label: "BetMGM",      emoji: "👑" },
  fanduel:     { label: "FanDuel",     emoji: "🦅" },
  draftkings:  { label: "DraftKings",  emoji: "🎯" },
  pinnacle:    { label: "Pinnacle",    emoji: "⛰️" },
  caesars:     { label: "Caesars",     emoji: "🏛️" },
  prizepicks:  { label: "PrizePicks",  emoji: "🏆" },
  underdog:    { label: "Underdog",    emoji: "🐕" },
  hardrock:    { label: "Hard Rock",   emoji: "🎸" },
};

function getBookDisplay(raw: string) {
  const key = raw.toLowerCase().replace(/\s+/g, "");
  return BOOK_CONFIG[key] ?? { label: raw, emoji: "📊" };
}

// ─── Decimal → American odds conversion ───────────────────────────────────────

function decimalToAmerican(decimal: number | null): string {
  if (decimal === null || decimal === undefined) return "—";
  const d = Number(decimal);
  if (!Number.isFinite(d) || d <= 1) return "—";
  if (d >= 2) {
    return `+${Math.round((d - 1) * 100)}`;
  }
  return String(Math.round(-100 / (d - 1)));
}

function formatOdds(price: number | null): { display: string; american: string; value: number | null } {
  if (price === null || price === undefined) return { display: "—", american: "—", value: null };
  const n = Number(price);
  if (!Number.isFinite(n)) return { display: "—", american: "—", value: null };

  // Detect if already american format (whole numbers like -110, +105)
  if (Math.abs(n) >= 100 && Number.isInteger(n)) {
    return {
      display: n > 0 ? `+${n}` : String(n),
      american: n > 0 ? `+${n}` : String(n),
      value: n,
    };
  }

  // Decimal
  const american = decimalToAmerican(n);
  return { display: n.toFixed(2), american, value: n };
}

// ─── EV detection ──────────────────────────────────────────────────────────────
// Simple: if hitRate >= 60 AND over_price implies > ~52% break-even → +EV
// If hitRate <= 40 AND under_price implies > ~52% break-even → +EV under

function impliedProb(americanStr: string): number | null {
  const n = Number(americanStr.replace("+", ""));
  if (!Number.isFinite(n)) return null;
  if (n < 0) return (-n) / (-n + 100);
  return 100 / (n + 100);
}

function isEV(priceStr: string, hitRate: number, forOver: boolean): boolean {
  const prob = impliedProb(priceStr);
  if (prob === null) return false;
  const hr = hitRate / 100;
  return forOver ? hr > prob + 0.03 : (1 - hr) > prob + 0.03;
}

// ─── Column header ─────────────────────────────────────────────────────────────

function ColHead({ children, align = "right" }: { children: React.ReactNode; align?: "left" | "right" | "center" }) {
  const cls = align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left";
  return (
    <th className={`px-4 py-2.5 text-[8px] font-black uppercase tracking-[0.25em] text-[var(--text-muted)] ${cls}`}>
      {children}
    </th>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function OddsComparisonTable({
  odds,
  lineValue,
  statLabel,
  hitRate = 50,
  avgValue,
}: OddsComparisonTableProps) {

  // ── Filter to rows matching active line (or closest line) ──────────────────
  const rows = useMemo(() => {
    if (!odds.length) return [];

    // Prefer exact line match, fallback to all rows grouped by book
    const exactMatch = odds.filter((o) => Math.abs(Number(o.line) - lineValue) < 0.26);
    const source     = exactMatch.length > 0 ? exactMatch : odds;

    // Dedupe by book — keep the one closest to lineValue
    const byBook = new Map<string, BookOdd>();
    for (const o of source) {
      const key  = o.book.toLowerCase();
      const curr = byBook.get(key);
      if (!curr) { byBook.set(key, o); continue; }
      if (Math.abs(Number(o.line) - lineValue) < Math.abs(Number(curr.line) - lineValue)) {
        byBook.set(key, o);
      }
    }

    return Array.from(byBook.values()).sort((a, b) =>
      a.book.localeCompare(b.book)
    );
  }, [odds, lineValue]);

  // ── Find best over and best under ─────────────────────────────────────────
  const { bestOverBook, bestUnderBook } = useMemo(() => {
    let bestO: { book: string; value: number } | null = null;
    let bestU: { book: string; value: number } | null = null;

    for (const row of rows) {
      const oFmt = formatOdds(row.over_price);
      const uFmt = formatOdds(row.under_price);

      // Best over = highest american (most value for bettor)
      if (oFmt.value !== null) {
        const american = Number(oFmt.american.replace("+", ""));
        if (bestO === null || american > bestO.value) {
          bestO = { book: row.book.toLowerCase(), value: american };
        }
      }

      if (uFmt.value !== null) {
        const american = Number(uFmt.american.replace("+", ""));
        if (bestU === null || american > bestU.value) {
          bestU = { book: row.book.toLowerCase(), value: american };
        }
      }
    }

    return { bestOverBook: bestO?.book ?? null, bestUnderBook: bestU?.book ?? null };
  }, [rows]);

  // ── Empty state ────────────────────────────────────────────────────────────
  if (rows.length === 0) {
    return (
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[2rem] px-5 py-8 text-center shadow-2xl">
        <TrendingUp size={20} className="text-[var(--text-muted)] mx-auto mb-2" />
        <p className="text-[10px] text-[var(--text-muted)] font-black uppercase tracking-widest">
          Sin cuotas disponibles
        </p>
        <p className="text-[9px] text-[var(--text-muted)] font-bold mt-1">
          para {statLabel} · línea {lineValue}
        </p>
      </div>
    );
  }

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[2rem] overflow-hidden shadow-2xl">

      {/* ── Header ─────────────────────────────────────────────────────────────── */}
      <div className="px-5 py-3 border-b border-[var(--border)] flex items-center justify-between gap-3">
        <div>
          <p className="text-[9px] text-[#10b981] font-black uppercase tracking-[0.25em]">
            Odds
          </p>
          <h3 className="text-[var(--text)] font-black uppercase tracking-tight">
            {rows.length} {rows.length === 1 ? "casa" : "casas"} · {statLabel} {lineValue}
          </h3>
        </div>
        <div className="flex items-center gap-3">
          {/* Legend */}
          <div className="hidden sm:flex items-center gap-3 text-[8px] font-black uppercase tracking-widest text-[var(--text-muted)]">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-[#10b981]" /> Mejor precio
            </span>
            <span className="flex items-center gap-1">
              <span className="text-[8px] font-black text-yellow-400 border border-yellow-400/30 px-1 rounded">+EV</span>
              Valor detectado
            </span>
          </div>
        </div>
      </div>

      {/* ── Table ──────────────────────────────────────────────────────────────── */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-[var(--bg)]/50">
            <tr>
              <ColHead align="left">Casa</ColHead>
              <ColHead align="center">Línea</ColHead>
              <ColHead>Over</ColHead>
              <ColHead>Under</ColHead>
            </tr>
          </thead>

          <tbody>
            {rows.map((row, idx) => {
              const bookKey = row.book.toLowerCase();
              const { label, emoji } = getBookDisplay(row.book);

              const oFmt     = formatOdds(row.over_price);
              const uFmt     = formatOdds(row.under_price);
              const isBestO  = bestOverBook  === bookKey;
              const isBestU  = bestUnderBook === bookKey;
              const isEVOver  = oFmt.american !== "—" && isEV(oFmt.american, hitRate, true);
              const isEVUnder = uFmt.american !== "—" && isEV(uFmt.american, hitRate, false);

              const lineMatch = Math.abs(Number(row.line) - lineValue) < 0.26;

              return (
                <tr
                  key={`${bookKey}-${idx}`}
                  className="border-t border-[var(--border)] hover:bg-white/[0.02] transition-colors"
                >
                  {/* Book name */}
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <span className="text-base leading-none" aria-hidden="true">{emoji}</span>
                      <span className="text-xs font-black uppercase text-[var(--text)]">{label}</span>
                    </div>
                  </td>

                  {/* Line */}
                  <td className="px-4 py-3 text-center">
                    <span className={`text-xs font-black tabular-nums ${
                      lineMatch ? "text-[var(--text)]" : "text-[var(--text-muted)]"
                    }`}>
                      {Number(row.line).toFixed(1)}
                    </span>
                  </td>

                  {/* Over */}
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <div className="flex items-center justify-end gap-1.5">
                      {isEVOver && (
                        <span className="text-[7px] font-black px-1 py-0.5 rounded border border-yellow-400/30 text-yellow-400 bg-yellow-400/10">
                          +EV
                        </span>
                      )}
                      <span className={`text-xs font-black tabular-nums ${
                        isBestO
                          ? "text-[#10b981]"
                          : oFmt.display === "—"
                          ? "text-[var(--text-muted)]"
                          : "text-[var(--text)]"
                      }`}>
                        {oFmt.american}
                      </span>
                      {isBestO && oFmt.display !== "—" && (
                        <span className="w-1.5 h-1.5 rounded-full bg-[#10b981] shrink-0" />
                      )}
                    </div>
                  </td>

                  {/* Under */}
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <div className="flex items-center justify-end gap-1.5">
                      {isEVUnder && (
                        <span className="text-[7px] font-black px-1 py-0.5 rounded border border-yellow-400/30 text-yellow-400 bg-yellow-400/10">
                          +EV
                        </span>
                      )}
                      <span className={`text-xs font-black tabular-nums ${
                        isBestU
                          ? "text-[#10b981]"
                          : uFmt.display === "—"
                          ? "text-[var(--text-muted)]"
                          : "text-[var(--text)]"
                      }`}>
                        {uFmt.american}
                      </span>
                      {isBestU && uFmt.display !== "—" && (
                        <span className="w-1.5 h-1.5 rounded-full bg-[#10b981] shrink-0" />
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── Footer ─────────────────────────────────────────────────────────────── */}
      <div className="px-5 py-2.5 border-t border-[var(--border)] bg-[var(--bg)]/30 flex items-center justify-between">
        <p className="text-[8px] text-[var(--text-muted)] font-bold">
          Cuotas en formato americano · Verde = mejor precio disponible
        </p>
        {rows[0]?.updated_at && (
          <div className="flex items-center gap-1 text-[var(--text-muted)]">
            <RefreshCw size={9} />
            <span className="text-[8px] font-bold tabular-nums">
              {new Date(rows[0].updated_at).toLocaleTimeString("es-AR", {
                hour: "2-digit", minute: "2-digit",
                timeZone: "America/Argentina/Buenos_Aires",
              })}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CÓMO CONECTAR con tu stakeOdds de PlayerChartContainer:
//
// Tu StakePlayerOdd tiene: { line, over_price, under_price, book, source }
// El tipo BookOdd espera:  { book, line, over_price, under_price }
// Son compatibles — solo hacé el cast:
//
//   <OddsComparisonTable
//     odds={selectedStakeOdds as BookOdd[]}
//     lineValue={lineValue}
//     statLabel={activeStatLabel}
//     hitRate={hitRateNumber}
//     avgValue={Number(avgValue)}
//   />
//
// Si tu tabla de odds en la BD tiene filas por casa (book="betmgm", book="fanduel", etc.)
// el componente las agrupa y detecta automáticamente el mejor precio y +EV.
// ─────────────────────────────────────────────────────────────────────────────
