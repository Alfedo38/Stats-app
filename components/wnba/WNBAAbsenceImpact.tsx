"use client";

import { useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight, UserRoundCheck, UserRoundX } from "lucide-react";
import { getWNBATeamTheme } from "./wnbaTeamColors";

export type WNBATeammateGame = {
  game_id: string;
  player_id: number;
  player_name: string;
  minutes?: string | number | null;
  comment?: string | null;
  start_position?: string | null;
  pts?: number | null;
  reb?: number | null;
  ast?: number | null;
};

type Candidate = {
  id: number;
  name: string;
  absenceRows: WNBATeammateGame[];
  presentRows: WNBATeammateGame[];
  startsWhenOut: number;
  samePosition: boolean;
  minutesGain: number;
  position: string;
};

function n(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function minutes(value: unknown) {
  if (typeof value === "number") return n(value);
  const raw = String(value ?? "");
  if (!raw.includes(":")) return n(raw);
  const [mins, secs] = raw.split(":").map(Number);
  return n(mins) + n(secs) / 60;
}

function positionGroups(value: unknown) {
  const raw = String(value || "").trim().toUpperCase();
  const groups = new Set<string>();
  if (raw.includes("GUARD")) groups.add("G");
  if (raw.includes("FORWARD")) groups.add("F");
  if (raw.includes("CENTER")) groups.add("C");
  if (!groups.size) {
    for (const token of raw.split(/[^A-Z]+/)) {
      if (["G", "F", "C"].includes(token)) groups.add(token);
    }
  }
  return groups;
}

function primaryPosition(rows: WNBATeammateGame[], fallback?: string | null) {
  const counts = new Map<string, number>();
  for (const group of positionGroups(fallback)) counts.set(group, (counts.get(group) || 0) + 1);
  for (const row of rows) {
    if (minutes(row.minutes) <= 0 || !row.start_position) continue;
    for (const group of positionGroups(row.start_position)) counts.set(group, (counts.get(group) || 0) + 1);
  }
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || "";
}

function average(rows: WNBATeammateGame[], key: "min" | "pts" | "reb" | "ast" | "pra") {
  if (!rows.length) return 0;
  return rows.reduce((sum, row) => {
    if (key === "min") return sum + minutes(row.minutes);
    if (key === "pra") return sum + n(row.pts) + n(row.reb) + n(row.ast);
    return sum + n(row[key]);
  }, 0) / rows.length;
}

function signed(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}`;
}

function shortName(value: string) {
  return value.trim().split(/\s+/)[0] || "ella";
}

export default function WNBAAbsenceImpact({
  playerId,
  playerName,
  teamGames,
  playerPosition,
  teamAbbr,
}: {
  playerId: number;
  playerName: string;
  teamGames: WNBATeammateGame[];
  playerPosition?: string | null;
  teamAbbr?: string | null;
}) {
  const theme = getWNBATeamTheme(teamAbbr);
  const [selected, setSelected] = useState("");

  const analysis = useMemo(() => {
    const byPlayer = new Map<number, WNBATeammateGame[]>();
    for (const row of teamGames || []) {
      const id = Number(row.player_id);
      if (!Number.isFinite(id)) continue;
      if (!byPlayer.has(id)) byPlayer.set(id, []);
      byPlayer.get(id)?.push(row);
    }

    const targetRows = byPlayer.get(Number(playerId)) || [];
    const absenceGames = new Set(targetRows.filter((row) => minutes(row.minutes) <= 0).map((row) => String(row.game_id)));
    const presentGames = new Set(targetRows.filter((row) => minutes(row.minutes) > 0).map((row) => String(row.game_id)));
    const targetPosition = primaryPosition(targetRows, playerPosition);
    const candidates: Candidate[] = [];

    for (const [id, rows] of byPlayer) {
      if (id === Number(playerId)) continue;
      const absenceRows = rows.filter((row) => absenceGames.has(String(row.game_id)) && minutes(row.minutes) > 0);
      if (!absenceRows.length) continue;
      const presentRows = rows.filter((row) => presentGames.has(String(row.game_id)) && minutes(row.minutes) > 0);
      const startsWhenOut = absenceRows.filter((row) => Boolean(row.start_position)).length;
      const position = primaryPosition(rows);
      const samePosition = Boolean(targetPosition && position && targetPosition === position);
      const minutesGain = average(absenceRows, "min") - average(presentRows, "min");
      if (!startsWhenOut && minutesGain < 3) continue;
      candidates.push({ id, name: rows.find((row) => row.player_name)?.player_name || "Jugadora", absenceRows, presentRows, startsWhenOut, samePosition, minutesGain, position });
    }

    candidates.sort((a, b) => Number(b.samePosition) - Number(a.samePosition) || b.startsWhenOut - a.startsWhenOut || b.minutesGain - a.minutesGain || b.absenceRows.length - a.absenceRows.length);
    return { absenceGames, candidates };
  }, [playerId, playerPosition, teamGames]);

  if (!analysis.absenceGames.size) return null;

  const selectedId = analysis.candidates.some((item) => String(item.id) === selected) ? selected : String(analysis.candidates[0]?.id || "");
  const candidate = analysis.candidates.find((item) => String(item.id) === selectedId);
  const absenceCount = analysis.absenceGames.size;
  const confidence = absenceCount >= 8 ? "Muestra sólida" : absenceCount >= 4 ? "Muestra media" : "Muestra baja";
  const metrics = candidate
    ? (["min", "pts", "reb", "ast", "pra"] as const).map((key) => {
        const absenceAvg = average(candidate.absenceRows, key);
        const presentAvg = average(candidate.presentRows, key);
        return { key, absenceAvg, presentAvg, delta: absenceAvg - presentAvg };
      })
    : [];

  return (
    <section className="rounded-[1.65rem] border p-4 md:p-5" style={{ borderColor: `${theme.primary}38`, background: `linear-gradient(135deg, ${theme.soft}, rgba(3,7,12,.98) 52%)` }}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div><p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.24em]" style={{ color: theme.primary }}><UserRoundX size={14} /> Reemplazo por ausencia</p><h2 className="mt-1 text-2xl font-black italic uppercase tracking-tighter">Cuando no juega {playerName}</h2><p className="mt-2 max-w-3xl text-[10px] font-bold uppercase leading-5 tracking-wider text-[var(--text-muted)]">Analiza quién tomó su lugar y cómo rindió. Solo cuenta ausencias confirmadas por una fila del box score con cero minutos.</p></div>
        {analysis.candidates.length > 0 && <label className="min-w-[280px] rounded-xl border border-white/10 bg-black/30 px-3 py-2"><span className="block text-[7px] font-black uppercase tracking-widest text-[var(--text-muted)]">Reemplazante analizada</span><select value={selectedId} onChange={(event) => setSelected(event.target.value)} className="mt-1 w-full bg-transparent text-xs font-black uppercase text-white outline-none">{analysis.candidates.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.startsWhenOut}/{absenceCount} titular</option>)}</select></label>}
      </div>

      {!candidate ? (
        <div className="mt-4 rounded-2xl border border-white/10 bg-black/30 p-5"><p className="flex items-center gap-2 text-sm font-black uppercase text-slate-200"><UserRoundCheck size={16} style={{ color: theme.primary }} /> {absenceCount} ausencias confirmadas</p><p className="mt-2 text-[10px] font-bold uppercase leading-5 text-[var(--text-muted)]">No hubo una reemplazante clara: ninguna compañera fue titular ni ganó al menos tres minutos de promedio en esas ausencias.</p></div>
      ) : (
        <>
          <div className="mt-4 grid gap-3 md:grid-cols-4"><Summary label={`Partidos sin ${shortName(playerName)}`} value={String(absenceCount)} color={theme.primary} /><Summary label="Titular en su lugar" value={`${candidate.startsWhenOut}/${absenceCount}`} color={candidate.startsWhenOut ? "#34d399" : "#fbbf24"} /><Summary label="Posición" value={candidate.samePosition ? `Compatible · ${candidate.position}` : candidate.position || "Sin dato"} color={candidate.samePosition ? "#34d399" : "#fbbf24"} /><Summary label="Lectura" value={confidence} color={absenceCount >= 4 ? "#38bdf8" : "#fbbf24"} /></div>
          <div className="mt-4 rounded-xl border border-white/10 bg-black/20 px-3 py-2"><p className="text-[9px] font-bold uppercase leading-5 text-[var(--text-muted)]"><span className="text-white">{candidate.name}</span> en los partidos sin {shortName(playerName)} frente a sus partidos cuando {shortName(playerName)} sí jugó.</p></div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">{metrics.map((metric) => { const positive = metric.delta >= 0; return <div key={metric.key} className="rounded-[1.1rem] border border-white/10 bg-black/30 p-3"><div className="flex items-center justify-between"><p className="text-[8px] font-black uppercase tracking-widest text-[var(--text-muted)]">{metric.key === "min" ? "MIN" : metric.key.toUpperCase()}</p><span className="flex items-center text-[10px] font-black" style={{ color: positive ? "#34d399" : "#fb7185" }}>{positive ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}{signed(metric.delta)}</span></div><p className="mt-2 text-2xl font-black italic tabular-nums">{metric.absenceAvg.toFixed(1)}</p><p className="mt-1 text-[8px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Con {shortName(playerName)}: {metric.presentAvg.toFixed(1)}</p></div>; })}</div>
          <p className="mt-3 text-[9px] leading-5 text-[var(--text-muted)]">La reemplazante se ordena por posición compatible, titularidades durante la ausencia y aumento de minutos. La diferencia muestra asociación, no causalidad.</p>
        </>
      )}
    </section>
  );
}

function Summary({ label, value, color }: { label: string; value: string; color: string }) {
  return <div className="rounded-[1.1rem] border border-white/10 bg-black/30 p-3"><p className="text-[8px] font-black uppercase tracking-widest text-[var(--text-muted)]">{label}</p><p className="mt-1 text-lg font-black uppercase" style={{ color }}>{value}</p></div>;
}
