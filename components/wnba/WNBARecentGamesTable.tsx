import type { WNBAPreparedLog } from "./types";
import { fmt } from "./utils";

export default function WNBARecentGamesTable({ logs }: { logs: WNBAPreparedLog[] }) {
  const recent = logs.slice(0, 12);

  return (
    <section className="overflow-hidden rounded-[2rem] border border-[var(--border)] bg-[var(--surface)] shadow-2xl">
      <div className="border-b border-[var(--border)] p-5">
        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#10b981]">Game log</p>
        <h2 className="mt-1 text-2xl font-black italic uppercase tracking-tighter">Últimos partidos</h2>
      </div>

      {recent.length === 0 ? (
        <div className="p-8 text-center text-xs font-black uppercase tracking-widest text-[var(--text-muted)]">
          Sin partidos cargados para esta jugadora
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse text-left">
            <thead className="bg-[var(--surface-soft)] text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)]">
              <tr>
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3">Partido</th>
                <th className="px-4 py-3 text-right">MIN</th>
                <th className="px-4 py-3 text-right">PTS</th>
                <th className="px-4 py-3 text-right">REB</th>
                <th className="px-4 py-3 text-right">AST</th>
                <th className="px-4 py-3 text-right">PRA</th>
                <th className="px-4 py-3 text-right">3PM</th>
                <th className="px-4 py-3 text-right">+/-</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)] text-sm font-bold">
              {recent.map((game) => (
                <tr key={`${game.game_id}-${game.game_date_safe}`} className="transition hover:bg-[var(--surface-soft)]">
                  <td className="px-4 py-3 text-[var(--text-muted)] tabular-nums">{game.game_date_safe}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-[9px] font-black ${game.wl === "W" ? "bg-[#10b981]/10 text-[#10b981]" : "bg-red-500/10 text-red-300"}`}>
                        {game.wl || "—"}
                      </span>
                      <span className="font-black uppercase tracking-tight">{game.matchup}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{fmt(game.minutes_value)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{fmt(game.pts, 0)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{fmt(game.reb, 0)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{fmt(game.ast, 0)}</td>
                  <td className="px-4 py-3 text-right font-black text-[#10b981] tabular-nums">{fmt(game.pra, 0)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{fmt(game.fg3m, 0)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{fmt(game.plus_minus, 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
