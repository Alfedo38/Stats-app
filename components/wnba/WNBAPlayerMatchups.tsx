"use client";

import { useMemo, useState } from "react";
import { Info, ShieldCheck, Target } from "lucide-react";
import { getWNBATeamTheme } from "./wnbaTeamColors";

export type WNBAMatchup = {
  season: string;
  season_type: string;
  offensive_player_id: number;
  offensive_player_name: string | null;
  defensive_player_id: number;
  defensive_player_name: string | null;
  gp: number | null;
  matchup_minutes: number | null;
  partial_possessions: number | null;
  player_points: number | null;
  team_points: number | null;
  matchup_assists: number | null;
  matchup_turnovers: number | null;
  matchup_blocks: number | null;
  matchup_fgm: number | null;
  matchup_fga: number | null;
  matchup_fg_pct: number | null;
  matchup_fg3m: number | null;
  matchup_fg3a: number | null;
  matchup_fg3_pct: number | null;
  shooting_fouls: number | null;
};

function n(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function percentage(made: unknown, attempted: unknown, supplied?: unknown) {
  const attempts = n(attempted);
  if (attempts > 0) return (n(made) / attempts) * 100;
  const raw = n(supplied);
  return raw <= 1 ? raw * 100 : raw;
}

function per100(value: unknown, possessions: unknown) {
  return n(possessions) ? (n(value) / n(possessions)) * 100 : 0;
}

export default function WNBAPlayerMatchups({ rows, teamAbbr }: { rows: WNBAMatchup[]; teamAbbr?: string | null }) {
  const theme = getWNBATeamTheme(teamAbbr);
  const [minimum, setMinimum] = useState(10);
  const [showAll, setShowAll] = useState(false);

  const summary = useMemo(
    () => [...(rows || [])]
      .filter((row) => n(row.partial_possessions) >= minimum)
      .sort((a, b) => n(b.partial_possessions) - n(a.partial_possessions)),
    [minimum, rows],
  );

  if (!rows?.length) {
    return <section className="rounded-[1.65rem] border p-4 md:p-5" style={{ borderColor: `${theme.primary}38`, background: `radial-gradient(circle at 100% 0%, ${theme.glow}, transparent 28%), rgba(3,7,12,.96)` }}><p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.24em]" style={{ color: theme.primary }}><ShieldCheck size={14} /> Emparejamientos defensivos</p><h2 className="mt-1 text-2xl font-black italic uppercase tracking-tighter">Quién la defendió esta temporada</h2><div className="mt-4 rounded-2xl border border-white/10 bg-black/30 p-5"><p className="text-sm font-black uppercase text-slate-200">Todavía no hay matchups cargados</p><p className="mt-2 text-[10px] font-bold uppercase leading-5 text-[var(--text-muted)]">La sección aparecerá automáticamente después de cargar el resumen de defensoras.</p></div></section>;
  }

  const visibleRows = showAll ? summary : summary.slice(0, 12);
  const mostFrequent = summary[0];
  const toughest = [...summary]
    .filter((row) => n(row.matchup_fga) >= 8)
    .sort((a, b) => percentage(a.matchup_fgm, a.matchup_fga, a.matchup_fg_pct) - percentage(b.matchup_fgm, b.matchup_fga, b.matchup_fg_pct))[0];
  const season = rows[0]?.season || "Temporada";
  const seasonType = rows[0]?.season_type || "";

  return (
    <section className="rounded-[1.65rem] border p-4 md:p-5" style={{ borderColor: `${theme.primary}38`, background: `radial-gradient(circle at 100% 0%, ${theme.glow}, transparent 28%), rgba(3,7,12,.96)` }}>
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.24em]" style={{ color: theme.primary }}><ShieldCheck size={14} /> Emparejamientos defensivos</p>
          <h2 className="mt-1 text-2xl font-black italic uppercase tracking-tighter md:text-3xl">Quién la defendió</h2>
          <p className="mt-2 max-w-3xl text-[10px] font-bold uppercase leading-5 tracking-wider text-[var(--text-muted)]">Defensoras asignadas con mayor frecuencia y resultado ofensivo durante esos emparejamientos.</p>
        </div>
        <div className="rounded-xl border px-3 py-2 text-right" style={{ borderColor: `${theme.primary}44`, background: `${theme.primary}0f` }}>
          <p className="text-[7px] font-black uppercase tracking-widest text-[var(--text-muted)]">Cobertura de los datos</p>
          <p className="mt-1 text-xs font-black uppercase" style={{ color: theme.primary }}>{season} · {seasonType}</p>
          <p className="mt-1 text-[8px] font-bold uppercase text-[var(--text-muted)]">Acumulado de temporada</p>
        </div>
      </div>

      <div className="mt-4 flex gap-3 rounded-[1.1rem] border border-amber-400/20 bg-amber-400/[.06] p-3">
        <Info size={16} className="mt-0.5 shrink-0 text-amber-300" />
        <p className="text-[9px] font-bold uppercase leading-5 tracking-wider text-amber-100/75">Esta fuente no separa los datos por partido, rival o fecha. Los números son reales, pero corresponden al total de la temporada y no deben leerse como un encuentro individual.</p>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="text-[8px] font-black uppercase tracking-widest text-[var(--text-muted)]">Mínimo de posesiones</span>
        {[5, 10, 20, 40].map((value) => <SmallButton key={value} active={minimum === value} onClick={() => { setMinimum(value); setShowAll(false); }} color={theme.primary}>{value}+</SmallButton>)}
        <span className="ml-auto text-[8px] font-black uppercase tracking-widest text-[var(--text-muted)]">{summary.length} defensoras en la muestra</span>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <SummaryCard label="Defensora más frecuente" value={mostFrequent?.defensive_player_name || "—"} detail={mostFrequent ? `${n(mostFrequent.partial_possessions).toFixed(1)} posesiones · ${n(mostFrequent.gp).toFixed(0)} PJ` : "Sin muestra"} color={theme.primary} />
        <SummaryCard label="Menor efectividad en TC" value={toughest?.defensive_player_name || "—"} detail={toughest ? `${percentage(toughest.matchup_fgm, toughest.matchup_fga, toughest.matchup_fg_pct).toFixed(1)}% · mínimo 8 tiros` : "Sin muestra suficiente"} color="#fbbf24" />
        <SummaryCard label="Cobertura visible" value={`${visibleRows.length} defensoras`} detail={`${minimum}+ posesiones compartidas`} color="#38bdf8" />
      </div>

      <div className="mt-4 overflow-x-auto rounded-[1.25rem] border border-white/10">
        <table className="min-w-[1040px] w-full text-left">
          <thead className="bg-white/[.035] text-[8px] font-black uppercase tracking-widest text-[var(--text-muted)]"><tr><th className="px-4 py-3">Defensora</th><th>PJ</th><th>Posesiones</th><th>Min matchup</th><th>PTS</th><th>PTS/100</th><th>TC</th><th>TC%</th><th>3P</th><th>AST</th><th>TOV</th><th>BLK</th><th>Faltas tiro</th></tr></thead>
          <tbody className="divide-y divide-white/[.06] text-xs font-black">
            {visibleRows.map((row) => {
              const possessions = n(row.partial_possessions);
              const fgPct = percentage(row.matchup_fgm, row.matchup_fga, row.matchup_fg_pct);
              return <tr key={row.defensive_player_id} className="transition hover:bg-white/[.025]"><td className="px-4 py-3 text-white">{row.defensive_player_name || `#${row.defensive_player_id}`}</td><td>{n(row.gp).toFixed(0)}</td><td style={{ color: theme.primary }}>{possessions.toFixed(1)}</td><td>{n(row.matchup_minutes).toFixed(1)}</td><td>{n(row.player_points).toFixed(0)}</td><td>{per100(row.player_points, possessions).toFixed(1)}</td><td>{n(row.matchup_fgm).toFixed(0)}/{n(row.matchup_fga).toFixed(0)}</td><td style={{ color: fgPct <= 40 ? "#34d399" : fgPct >= 50 ? "#fb7185" : "white" }}>{fgPct.toFixed(1)}%</td><td>{n(row.matchup_fg3m).toFixed(0)}/{n(row.matchup_fg3a).toFixed(0)}</td><td>{n(row.matchup_assists).toFixed(0)}</td><td>{n(row.matchup_turnovers).toFixed(0)}</td><td>{n(row.matchup_blocks).toFixed(0)}</td><td>{n(row.shooting_fouls).toFixed(0)}</td></tr>;
            })}
          </tbody>
        </table>
      </div>

      {!summary.length && <div className="flex items-center justify-center gap-2 py-8 text-xs font-bold uppercase tracking-widest text-[var(--text-muted)]"><Target size={15} /> No hay defensoras para este mínimo.</div>}
      {summary.length > 12 && <button type="button" onClick={() => setShowAll((value) => !value)} className="mt-3 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-[9px] font-black uppercase tracking-widest text-slate-300 transition hover:border-white/25 hover:text-white">{showAll ? "Mostrar solo las principales" : `Ver las ${summary.length} defensoras`}</button>}
      <p className="mt-3 text-[9px] leading-5 text-[var(--text-muted)]">Las posesiones pueden ser parciales por cambios y ayudas. “Menor efectividad” exige al menos ocho tiros dentro de la muestra seleccionada.</p>
    </section>
  );
}

function SmallButton({ active, onClick, color, children }: { active: boolean; onClick: () => void; color: string; children: React.ReactNode }) {
  return <button type="button" onClick={onClick} className="rounded-lg border px-3 py-1.5 text-[8px] font-black uppercase tracking-wider transition" style={{ borderColor: active ? `${color}aa` : "rgba(148,163,184,.16)", background: active ? `${color}1c` : "transparent", color: active ? color : "rgb(148 163 184)" }}>{children}</button>;
}

function SummaryCard({ label, value, detail, color }: { label: string; value: string; detail: string; color: string }) {
  return <div className="rounded-[1.1rem] border border-white/10 bg-black/30 p-3"><p className="text-[8px] font-black uppercase tracking-widest text-[var(--text-muted)]">{label}</p><p className="mt-1 truncate text-base font-black uppercase" style={{ color }}>{value}</p><p className="mt-1 text-[8px] font-bold uppercase tracking-wider text-[var(--text-muted)]">{detail}</p></div>;
}
