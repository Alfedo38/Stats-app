"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Crosshair, Info, Target, X } from "lucide-react";
import { getWNBATeamTheme } from "./wnbaTeamColors";

export type WNBAShot = {
  game_id: string;
  game_event_id: number;
  game_date: string;
  player_id: number;
  period: number | null;
  minutes_remaining: number | null;
  seconds_remaining: number | null;
  event_type: string | null;
  action_type: string | null;
  shot_type: string | null;
  shot_zone_basic: string | null;
  shot_zone_area: string | null;
  shot_zone_range: string | null;
  shot_distance: number | null;
  loc_x: number | null;
  loc_y: number | null;
  shot_made_flag: number | null;
  opponent_abbr: string | null;
  home_away: string | null;
};

type ResultFilter = "ALL" | "MADE" | "MISSED";

type ShotGame = {
  id: string;
  date: string;
  opponent: string;
  homeAway: string;
  attempts: number;
  made: number;
};

function n(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function dateLabel(value: string) {
  const raw = String(value || "").slice(0, 10);
  const [year, month, day] = raw.split("-");
  return year && month && day ? `${day}/${month}/${year.slice(-2)}` : raw;
}

function clockLabel(shot: WNBAShot) {
  return `${n(shot.minutes_remaining)}:${String(n(shot.seconds_remaining)).padStart(2, "0")}`;
}

function courtX(value: number | null) {
  return Math.max(-245, Math.min(245, n(value)));
}

function courtY(value: number | null) {
  return Math.max(-45, Math.min(415, n(value)));
}

function zoneLabel(value: string | null | undefined) {
  const labels: Record<string, string> = {
    "Restricted Area": "Zona restringida",
    "In The Paint (Non-RA)": "Pintura · fuera de zona restringida",
    "Mid-Range": "Media distancia",
    "Above the Break 3": "Triple frontal",
    "Left Corner 3": "Triple desde la esquina izquierda",
    "Right Corner 3": "Triple desde la esquina derecha",
    Backcourt: "Campo trasero",
  };
  return labels[String(value || "")] || value || "Sin clasificar";
}

function areaLabel(value: string | null | undefined) {
  const labels: Record<string, string> = {
    "Center(C)": "Centro",
    "Left Side(L)": "Lado izquierdo",
    "Right Side(R)": "Lado derecho",
    "Left Side Center(LC)": "Centro izquierdo",
    "Right Side Center(RC)": "Centro derecho",
    "Back Court(BC)": "Campo trasero",
  };
  return labels[String(value || "")] || value || "";
}

function rangeLabel(value: string | null | undefined) {
  const labels: Record<string, string> = {
    "Less Than 8 ft.": "Menos de 8 pies",
    "8-16 ft.": "Entre 8 y 16 pies",
    "16-24 ft.": "Entre 16 y 24 pies",
    "24+ ft.": "24 pies o más",
    "Back Court Shot": "Tiro desde campo trasero",
  };
  const raw = String(value || "");
  return labels[raw] || raw.replace(/ft\.?/gi, "pies");
}

function actionLabel(action: string | null, shotType: string | null) {
  const raw = String(action || "").trim();
  const rules: Array<[RegExp, string]> = [
    [/cutting.*layup/i, "Bandeja tras corte"],
    [/driving.*layup/i, "Bandeja en penetración"],
    [/running.*layup/i, "Bandeja en carrera"],
    [/reverse.*layup/i, "Bandeja pasada"],
    [/layup/i, "Bandeja"],
    [/alley.?oop.*dunk/i, "Mate alley-oop"],
    [/driving.*dunk/i, "Mate en penetración"],
    [/running.*dunk/i, "Mate en carrera"],
    [/dunk/i, "Mate"],
    [/step.?back.*jump/i, "Tiro en paso atrás"],
    [/pull.?up.*jump/i, "Tiro tras drible"],
    [/turnaround.*jump/i, "Tiro en giro"],
    [/floating.*jump/i, "Flotadora"],
    [/running.*jump/i, "Tiro en carrera"],
    [/fadeaway/i, "Tiro en suspensión alejándose"],
    [/hook/i, "Gancho"],
    [/jump/i, "Tiro en suspensión"],
    [/tip/i, "Palmeo"],
  ];
  for (const [pattern, label] of rules) if (pattern.test(raw)) return label;
  if (String(shotType).includes("3PT")) return "Tiro de tres puntos";
  if (String(shotType).includes("2PT")) return "Tiro de dos puntos";
  return raw || "Tiro de campo";
}

function Court() {
  return (
    <g fill="none" stroke="currentColor" strokeWidth="2" opacity="0.62">
      <rect x="-250" y="-52" width="500" height="470" rx="4" />
      <line x1="-250" y1="-47.5" x2="250" y2="-47.5" />
      <rect x="-80" y="-47.5" width="160" height="190" />
      <rect x="-60" y="-47.5" width="120" height="190" />
      <circle cx="0" cy="142.5" r="60" />
      <circle cx="0" cy="0" r="7.5" />
      <line x1="-30" y1="-7.5" x2="30" y2="-7.5" strokeWidth="3" />
      <path d="M -40 -7.5 A 40 40 0 0 0 40 -7.5" />
      <path d="M -220 -47.5 L -220 92.5 A 237.5 237.5 0 0 0 220 92.5 L 220 -47.5" />
      <path d="M -250 417.5 A 60 60 0 0 1 -190 357.5" />
      <path d="M 250 417.5 A 60 60 0 0 0 190 357.5" />
    </g>
  );
}

export default function WNBAShotChart({ shots, teamAbbr }: { shots: WNBAShot[]; teamAbbr?: string | null }) {
  const theme = getWNBATeamTheme(teamAbbr);
  const [period, setPeriod] = useState(0);
  const [result, setResult] = useState<ResultFilter>("ALL");
  const [selectedGameId, setSelectedGameId] = useState("");
  const [hovered, setHovered] = useState<WNBAShot | null>(null);
  const [pinned, setPinned] = useState<WNBAShot | null>(null);

  const normalized = useMemo(() => [...(shots || [])].sort((a, b) => String(b.game_date).localeCompare(String(a.game_date)) || Number(b.game_event_id) - Number(a.game_event_id)), [shots]);
  const games = useMemo<ShotGame[]>(() => {
    const grouped = new Map<string, ShotGame>();
    for (const shot of normalized) {
      const id = String(shot.game_id);
      const current = grouped.get(id) || {
        id,
        date: String(shot.game_date || "").slice(0, 10),
        opponent: String(shot.opponent_abbr || "S/D").toUpperCase(),
        homeAway: String(shot.home_away || "").toUpperCase(),
        attempts: 0,
        made: 0,
      };
      current.attempts += 1;
      current.made += n(shot.shot_made_flag) === 1 ? 1 : 0;
      grouped.set(id, current);
    }
    return Array.from(grouped.values()).sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  }, [normalized]);

  const activeGameId = games.some((game) => game.id === selectedGameId) ? selectedGameId : games[0]?.id || "";
  const activeGame = games.find((game) => game.id === activeGameId) || games[0];
  const activeGameIndex = Math.max(0, games.findIndex((game) => game.id === activeGameId));
  const opponentTheme = getWNBATeamTheme(activeGame?.opponent);

  const sampleData = useMemo(() => {
    const base = normalized.filter((shot) => String(shot.game_id) === activeGameId && (!period || n(shot.period) === period) && shot.loc_x !== null && shot.loc_y !== null);
    const visible = base.filter((shot) => result === "MADE" ? n(shot.shot_made_flag) === 1 : result === "MISSED" ? n(shot.shot_made_flag) !== 1 : true);
    return { base, visible };
  }, [normalized, activeGameId, period, result]);

  const made = sampleData.base.filter((shot) => n(shot.shot_made_flag) === 1).length;
  const threes = sampleData.base.filter((shot) => String(shot.shot_type).includes("3PT"));
  const threesMade = threes.filter((shot) => n(shot.shot_made_flag) === 1).length;
  const pct = sampleData.base.length ? (made / sampleData.base.length) * 100 : 0;
  const selectedShot = pinned || hovered;
  const zones = useMemo(() => {
    const grouped = new Map<string, { label: string; attempts: number; made: number }>();
    for (const shot of sampleData.base) {
      const label = shot.shot_zone_basic || "Sin clasificar";
      const current = grouped.get(label) || { label, attempts: 0, made: 0 };
      current.attempts += 1;
      current.made += n(shot.shot_made_flag) === 1 ? 1 : 0;
      grouped.set(label, current);
    }
    return Array.from(grouped.values()).sort((a, b) => b.attempts - a.attempts).slice(0, 6);
  }, [sampleData.base]);

  useEffect(() => { setPinned(null); setHovered(null); }, [period, result, activeGameId]);

  const chooseGame = (gameId: string) => {
    setSelectedGameId(gameId);
    setPeriod(0);
    setResult("ALL");
  };

  const moveGame = (delta: number) => {
    const next = games[activeGameIndex + delta];
    if (next) chooseGame(next.id);
  };

  if (!shots?.length) return <section className="rounded-[1.65rem] border border-[var(--border)] bg-[var(--surface)] p-5"><p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.24em]" style={{ color: theme.primary }}><Target size={14} /> Mapa de tiros</p><h2 className="mt-2 text-2xl font-black italic uppercase tracking-tighter">Todavía sin tiros cargados</h2><p className="mt-2 max-w-2xl text-xs leading-6 text-[var(--text-muted)]">El perfil sigue funcionando normalmente. El mapa aparecerá después de la actualización incremental.</p></section>;

  const resultLabel = result === "ALL" ? `${sampleData.visible.length} tiros` : result === "MADE" ? `${sampleData.visible.length} convertidos de ${sampleData.base.length}` : `${sampleData.visible.length} fallados de ${sampleData.base.length}`;
  return (
    <section className="overflow-visible rounded-[1.65rem] border p-4 md:p-5" style={{ borderColor: `${theme.primary}40`, background: `radial-gradient(circle at 8% 0%, ${theme.glow}, transparent 26%), rgba(3,7,12,.97)` }}>
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between"><div><p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.24em]" style={{ color: theme.primary }}><Crosshair size={14} /> Mapa de tiros por partido</p><h2 className="mt-1 text-2xl font-black italic uppercase tracking-tighter md:text-3xl">Dónde y cómo lanzó</h2><p className="mt-2 text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Un encuentro a la vez · el más reciente aparece primero</p></div><div className="grid grid-cols-3 gap-2"><Stat label="TC" value={`${made}/${sampleData.base.length}`} color={theme.primary} /><Stat label="TC%" value={`${pct.toFixed(1)}%`} color={pct >= 45 ? "#34d399" : "#fbbf24"} /><Stat label="3PT" value={`${threesMade}/${threes.length}`} color="#38bdf8" /></div></div>

      <div className="mt-5 rounded-[1.35rem] border border-white/10 bg-black/20 p-3">
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto]">
          <div className="rounded-xl border bg-black/30 p-3" style={{ borderColor: `${opponentTheme.primary}55` }}>
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-[8px] font-black uppercase tracking-widest text-[var(--text-muted)]"><CalendarDays size={12} /> Partido seleccionado</p>
                <p className="mt-1 text-xl font-black uppercase tracking-tight"><span style={{ color: theme.primary }}>{String(teamAbbr || "WNBA").toUpperCase()}</span> {activeGame?.homeAway === "AWAY" ? "@" : "vs"} <span style={{ color: opponentTheme.primary }}>{activeGame?.opponent || "—"}</span></p>
                <p className="mt-1 text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)]">{activeGame ? dateLabel(activeGame.date) : "—"} · partido {activeGameIndex + 1} de {games.length} · {activeGame?.made || 0}/{activeGame?.attempts || 0} TC</p>
              </div>
              <select value={activeGameId} onChange={(event) => chooseGame(event.target.value)} className="min-w-0 rounded-xl border border-white/15 bg-[#07131a] px-3 py-2.5 text-[10px] font-black uppercase text-white outline-none md:min-w-[310px]" aria-label="Elegir partido">
                {games.map((game, index) => <option key={game.id} value={game.id}>{index + 1}. {dateLabel(game.date)} · {game.homeAway === "AWAY" ? "@" : "vs"} {game.opponent} · {game.made}/{game.attempts} TC</option>)}
              </select>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => moveGame(-1)} disabled={activeGameIndex === 0} className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-[8px] font-black uppercase tracking-widest text-slate-300 transition hover:border-white/25 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"><ChevronLeft size={13} /> Partido más reciente</button>
              <button type="button" onClick={() => moveGame(1)} disabled={activeGameIndex >= games.length - 1} className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-[8px] font-black uppercase tracking-widest text-slate-300 transition hover:border-white/25 hover:text-white disabled:cursor-not-allowed disabled:opacity-30">Partido anterior <ChevronRight size={13} /></button>
            </div>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/25 p-3 xl:min-w-[390px]">
            <div className="flex flex-wrap items-center gap-2"><span className="mr-1 text-[8px] font-black uppercase tracking-widest text-[var(--text-muted)]">Periodo</span>{[0, 1, 2, 3, 4].map((item) => <FilterButton key={item} active={period === item} onClick={() => setPeriod(item)} label={item === 0 ? "Partido" : `Q${item}`} color={theme.primary} />)}</div>
            <div className="mt-3 flex flex-wrap items-center gap-2"><span className="mr-1 text-[8px] font-black uppercase tracking-widest text-[var(--text-muted)]">Mostrar</span>{(["ALL", "MADE", "MISSED"] as const).map((item) => <FilterButton key={item} active={result === item} onClick={() => setResult(item)} label={item === "ALL" ? "Todos" : item === "MADE" ? "Convertidos" : "Fallados"} color={item === "MISSED" ? "#fb7185" : item === "MADE" ? "#34d399" : theme.primary} />)}</div>
            <p className="mt-3 text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)]">{resultLabel}</p>
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,760px)_minmax(270px,1fr)]">
        <div className="relative min-h-[430px] overflow-hidden rounded-[1.35rem] border border-white/10 bg-[#071018] p-2">
          <svg viewBox="-260 -62 520 500" className="h-full min-h-[430px] w-full text-slate-500" role="img" aria-label="Mapa de tiros de la jugadora"><defs><radialGradient id="wnbaCourtGlow"><stop offset="0" stopColor={theme.primary} stopOpacity=".10" /><stop offset="1" stopColor={theme.primary} stopOpacity="0" /></radialGradient></defs><rect x="-260" y="-62" width="520" height="500" fill="url(#wnbaCourtGlow)" /><Court />{sampleData.visible.map((shot) => { const converted = n(shot.shot_made_flag) === 1; const active = selectedShot?.game_id === shot.game_id && selectedShot?.game_event_id === shot.game_event_id; const x = courtX(shot.loc_x); const y = courtY(shot.loc_y); const size = active ? 8 : 6; return <g key={`${shot.game_id}-${shot.game_event_id}`} className="cursor-pointer" onMouseEnter={() => setHovered(shot)} onMouseLeave={() => setHovered(null)} onClick={() => setPinned((current) => current?.game_id === shot.game_id && current?.game_event_id === shot.game_event_id ? null : shot)} role="button" aria-label={`${converted ? "Convertido" : "Fallado"} ${shot.action_type || "tiro"}`}><circle cx={x} cy={y} r={12} fill="transparent" />{converted ? <circle cx={x} cy={y} r={size} fill="#22c55e" fillOpacity={active ? 1 : .82} stroke={active ? "white" : "#86efac"} strokeWidth={active ? 2.5 : 1.4} /> : <g stroke={active ? "white" : "#fb7185"} strokeWidth={active ? 3 : 2.3} strokeLinecap="round"><line x1={x - size} y1={y - size} x2={x + size} y2={y + size} /><line x1={x + size} y1={y - size} x2={x - size} y2={y + size} /></g>}</g>; })}</svg>
          <div className="pointer-events-none absolute left-3 top-3 rounded-xl border border-white/10 bg-black/70 px-3 py-2 text-[8px] font-black uppercase tracking-widest text-slate-300">Canasta ↑</div><div className="pointer-events-none absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-4 whitespace-nowrap rounded-xl border border-white/10 bg-black/75 px-3 py-2 text-[8px] font-black uppercase tracking-widest"><span className="text-emerald-400">● Convertido</span><span className="text-rose-400">× Fallado</span></div>{!sampleData.visible.length && <div className="absolute inset-0 flex items-center justify-center bg-black/45"><p className="rounded-xl border border-white/10 bg-black/70 px-5 py-3 text-xs font-black uppercase tracking-widest text-slate-300">Sin tiros para este filtro</p></div>}
        </div>
        <div className="min-h-[430px] rounded-[1.35rem] border border-white/10 bg-black/30 p-4">{selectedShot ? <ShotDetail shot={selectedShot} color={theme.primary} pinned={Boolean(pinned)} onClose={() => setPinned(null)} /> : <ZoneSummary zones={zones} shots={sampleData.base} color={theme.primary} />}</div>
      </div>
    </section>
  );
}

function ShotDetail({ shot, color, pinned, onClose }: { shot: WNBAShot; color: string; pinned: boolean; onClose: () => void }) {
  const made = n(shot.shot_made_flag) === 1;
  const location = [zoneLabel(shot.shot_zone_basic), areaLabel(shot.shot_zone_area), rangeLabel(shot.shot_zone_range)].filter(Boolean).join(" · ");
  return <div className="space-y-4"><div className="flex items-start justify-between gap-3"><div><p className="text-[9px] font-black uppercase tracking-widest" style={{ color: made ? "#34d399" : "#fb7185" }}>{made ? "Convertido" : "Fallado"}{pinned ? " · selección fijada" : ""}</p><p className="mt-1 text-xl font-black uppercase">{actionLabel(shot.action_type, shot.shot_type)}</p></div>{pinned && <button type="button" onClick={onClose} className="rounded-lg border border-white/10 p-2 text-slate-400 transition hover:text-white" aria-label="Cerrar detalle"><X size={14} /></button>}</div><div className="grid grid-cols-2 gap-2"><InfoCell label="Partido" value={`${shot.home_away === "AWAY" ? "@" : "vs"} ${shot.opponent_abbr || "—"}`} /><InfoCell label="Fecha" value={dateLabel(shot.game_date)} /><InfoCell label="Momento" value={`Q${shot.period || "—"} · ${clockLabel(shot)}`} /><InfoCell label="Distancia" value={`${n(shot.shot_distance)} pies`} /></div><div className="rounded-xl border border-white/10 p-3"><p className="text-[8px] font-black uppercase tracking-widest text-[var(--text-muted)]">Zona</p><p className="mt-1 text-xs font-black uppercase leading-5">{location || "Sin clasificación"}</p></div><p className="flex items-center gap-2 text-[9px] leading-5 text-[var(--text-muted)]"><Info size={13} style={{ color }} /> En móvil tocá otro lanzamiento para cambiar la selección.</p></div>;
}

function ZoneSummary({ zones, shots, color }: { zones: { label: string; attempts: number; made: number }[]; shots: WNBAShot[]; color: string }) {
  const total = shots.length;
  const twoPointers = shots.filter((shot) => !String(shot.shot_type).includes("3PT"));
  const threePointers = shots.filter((shot) => String(shot.shot_type).includes("3PT"));
  const made = (rows: WNBAShot[]) => rows.filter((shot) => n(shot.shot_made_flag) === 1).length;
  const averageDistance = total ? shots.reduce((sum, shot) => sum + n(shot.shot_distance), 0) / total : 0;
  return <div><p className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest" style={{ color }}><Target size={14} /> Distribución por zona</p><h3 className="mt-1 text-xl font-black uppercase">Lectura de la muestra</h3><p className="mt-2 text-[10px] leading-5 text-[var(--text-muted)]">Pasá el cursor o tocá un lanzamiento para ver su detalle.</p><div className="mt-4 grid grid-cols-3 gap-2"><MiniStat label="Dobles" value={`${made(twoPointers)}/${twoPointers.length}`} /><MiniStat label="Triples" value={`${made(threePointers)}/${threePointers.length}`} /><MiniStat label="Dist. media" value={`${averageDistance.toFixed(1)} pies`} /></div><div className="mt-4 space-y-3">{zones.map((zone) => { const pct = zone.attempts ? (zone.made / zone.attempts) * 100 : 0; const share = total ? (zone.attempts / total) * 100 : 0; return <div key={zone.label} className="rounded-xl border border-white/10 bg-black/25 p-3"><div className="flex items-start justify-between gap-3"><div><p className="text-[9px] font-black uppercase leading-4 text-slate-200">{zoneLabel(zone.label)}</p><p className="mt-1 text-[8px] font-bold uppercase tracking-wider text-[var(--text-muted)]">{zone.made}/{zone.attempts} · {pct.toFixed(1)}%</p></div><span className="text-xs font-black" style={{ color }}>{share.toFixed(0)}%</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full" style={{ width: `${share}%`, background: color }} /></div></div>; })}{!zones.length && <p className="py-10 text-center text-xs font-black uppercase tracking-widest text-slate-500">Sin zonas para mostrar</p>}</div></div>;
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-white/10 bg-black/25 px-2 py-2.5"><p className="text-[7px] font-black uppercase tracking-widest text-[var(--text-muted)]">{label}</p><p className="mt-1 whitespace-nowrap text-xs font-black text-white">{value}</p></div>;
}

function FilterButton({ active, onClick, label, color }: { active: boolean; onClick: () => void; label: string; color: string }) {
  return <button type="button" onClick={onClick} className="rounded-xl border px-3 py-2 text-[9px] font-black uppercase tracking-widest transition" style={{ borderColor: active ? `${color}cc` : "rgba(148,163,184,.18)", background: active ? `${color}18` : "rgba(0,0,0,.22)", color: active ? color : "rgb(148 163 184)", boxShadow: active ? `inset 0 0 0 1px ${color}18` : "none" }}>{label}</button>;
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return <div className="min-w-20 rounded-xl border border-white/10 bg-black/30 px-3 py-2"><p className="text-[7px] font-black uppercase tracking-widest text-[var(--text-muted)]">{label}</p><p className="mt-1 text-lg font-black tabular-nums" style={{ color }}>{value}</p></div>;
}

function InfoCell({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-white/10 p-3"><p className="text-[7px] font-black uppercase tracking-widest text-[var(--text-muted)]">{label}</p><p className="mt-1 text-xs font-black uppercase">{value}</p></div>;
}
