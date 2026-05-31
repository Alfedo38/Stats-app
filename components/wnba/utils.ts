import type { WNBADailyGame, WNBALogRow, WNBAPreparedLog } from "./types";

export const WNBA_ACCENT = "#10b981";

export function getOne(value: string | string[] | undefined, fallback: string) {
  if (Array.isArray(value)) return value[0] ?? fallback;
  return value ?? fallback;
}

export function argentinaToday() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const d = parts.find((p) => p.type === "day")?.value;
  return `${y}-${m}-${d}`;
}

export function addDays(dateStr: string, days: number) {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function qs(params: Record<string, string>) {
  return `?${new URLSearchParams(params).toString()}`;
}

export function fmt(value: number | string | null | undefined, digits = 1) {
  if (value === null || value === undefined || value === "") return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return n.toFixed(digits);
}

export function compact(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(n);
}

export function pct(value: number | null | undefined, digits = 1) {
  if (value === null || value === undefined) return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return `${(n * 100).toFixed(digits)}%`;
}

export function pctAlready(value: number | null | undefined, digits = 1) {
  if (value === null || value === undefined) return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return `${n.toFixed(digits)}%`;
}

export function signed(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return n > 0 ? `+${n.toFixed(1)}` : n.toFixed(1);
}

export function initials(name?: string | null) {
  const parts = String(name || "WNBA").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "WN";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function splitName(playerName: string) {
  const parts = playerName.trim().split(/\s+/).filter(Boolean);
  const firstName = parts[0] || "Jugadora";
  const lastName = parts.slice(1).join(" ") || "WNBA";
  return { firstName, lastName };
}

export function timeAR(iso?: string | null) {
  if (!iso) return "Horario a confirmar";
  try {
    return new Intl.DateTimeFormat("es-AR", {
      timeZone: "America/Argentina/Buenos_Aires",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return "Horario a confirmar";
  }
}

export function dateAR(dateStr?: string | null) {
  if (!dateStr) return "—";
  try {
    return new Intl.DateTimeFormat("es-AR", {
      timeZone: "America/Argentina/Buenos_Aires",
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(new Date(`${dateStr}T12:00:00Z`));
  } catch {
    return dateStr;
  }
}

export function statusLabel(game: WNBADailyGame) {
  const state = String(game.status_state ?? game.status_type ?? "").toLowerCase();
  const name = String(game.status_name ?? "").toLowerCase();
  if (state === "post" || name.includes("final")) return "FINAL";
  if (state === "in" || name.includes("progress") || name.includes("live")) return "EN VIVO";
  return "PROGRAMADO";
}

export function score(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  return String(value);
}

export function toNumber(value: unknown, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function formatMinutes(value: unknown) {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "number") return value;
  const raw = String(value);
  if (raw.includes(":")) {
    const [m, s] = raw.split(":").map(Number);
    if (Number.isFinite(m)) return m + (Number.isFinite(s) ? s / 60 : 0);
  }
  return toNumber(raw);
}

export function prepareWNBALogs(logs: WNBALogRow[]): WNBAPreparedLog[] {
  return (logs || [])
    .map((row) => {
      const pts = toNumber(row.pts);
      const reb = toNumber(row.reb);
      const ast = toNumber(row.ast);
      const stl = toNumber(row.stl);
      const blk = toNumber(row.blk);
      const opponent = row.opponent_abbr || "---";
      const loc = row.home_away === "AWAY" ? "@" : "vs";
      const minutes_value = formatMinutes(row.minutes ?? row.min);

      return {
        ...row,
        game_date_safe: String(row.game_date || "").includes("T")
          ? String(row.game_date).split("T")[0]
          : String(row.game_date || ""),
        matchup: `${row.team_abbreviation || "WNBA"} ${loc} ${opponent}`,
        minutes_value,
        pts,
        reb,
        ast,
        stl,
        blk,
        turnovers: toNumber(row.turnovers),
        pra: pts + reb + ast,
        pts_reb: pts + reb,
        pts_ast: pts + ast,
        reb_ast: reb + ast,
        stl_blk: stl + blk,
      };
    })
    .sort((a, b) => new Date(b.game_date_safe || 0).getTime() - new Date(a.game_date_safe || 0).getTime());
}

export function average<T>(rows: T[], getter: (row: T) => number | null | undefined) {
  if (!rows.length) return 0;
  const values = rows.map((row) => Number(getter(row) ?? 0)).filter(Number.isFinite);
  if (!values.length) return 0;
  return values.reduce((acc, value) => acc + value, 0) / values.length;
}
