import type { WNBAPreparedLog } from "./types";
import { average, fmt } from "./utils";

const rows = [
  { key: "pts", label: "PTS" },
  { key: "reb", label: "REB" },
  { key: "ast", label: "AST" },
  { key: "pra", label: "PRA" },
] as const;

export default function WNBAPlayerTrendChart({ logs }: { logs: WNBAPreparedLog[] }) {
  const latest = logs.slice(0, 10).reverse();
  const maxPra = Math.max(1, ...latest.map((g) => Number(g.pra || 0)));

  return (
    <section className="rounded-[2rem] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-2xl">
      <div className="mb-5 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#10b981]">Tendencia reciente</p>
          <h2 className="mt-1 text-2xl font-black italic uppercase tracking-tighter">Últimos 10 partidos</h2>
        </div>
        <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">Barras = PRA</p>
      </div>

      {latest.length === 0 ? (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-soft)] p-8 text-center text-xs font-black uppercase tracking-widest text-[var(--text-muted)]">
          Sin partidos recientes cargados
        </div>
      ) : (
        <>
          <div className="mb-5 grid grid-cols-2 gap-2 md:grid-cols-4">
            {rows.map((r) => (
              <div key={r.key} className="rounded-2xl border border-[var(--border)] bg-black/10 p-3">
                <p className="text-[8px] font-black uppercase tracking-widest text-[var(--text-muted)]">Prom L10 {r.label}</p>
                <p className="text-2xl font-black tracking-tighter text-[var(--text)] tabular-nums">{fmt(average(latest, (x) => Number(x[r.key])))}</p>
              </div>
            ))}
          </div>

          <div className="flex h-56 items-end gap-2 rounded-2xl border border-[var(--border)] bg-[var(--surface-soft)] p-4">
            {latest.map((game) => {
              const height = Math.max(8, Math.round((Number(game.pra || 0) / maxPra) * 100));
              return (
                <div key={`${game.game_id}-${game.game_date_safe}`} className="group flex min-w-0 flex-1 flex-col items-center justify-end gap-2">
                  <div className="relative w-full rounded-t-xl bg-[#10b981]/25 transition group-hover:bg-[#10b981]" style={{ height: `${height}%` }}>
                    <span className="absolute -top-7 left-1/2 hidden -translate-x-1/2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-[10px] font-black tabular-nums group-hover:block">
                      {fmt(game.pra)}
                    </span>
                  </div>
                  <p className="max-w-full truncate text-[8px] font-black uppercase tracking-widest text-[var(--text-muted)]">
                    {game.opponent_abbr || "---"}
                  </p>
                </div>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
