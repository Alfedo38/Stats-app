// ─────────────────────────────────────────────────────────────────────────────
// lib/playerUtils.ts
// Helpers compartidos para player page.
// Mantiene compatibilidad con imports viejos y evita bugs de timezone/display.
// ─────────────────────────────────────────────────────────────────────────────

import { formatDateOnly, formatMinutes, getMinutesValue as getCleanMinutesValue, normalizeDateOnly } from "@/lib/formatters";

// ─── Minutos ─────────────────────────────────────────────────────────────────

export function getMinutesValue(raw: any): number | null {
  return getCleanMinutesValue(raw);
}

export function getMinutesLabel(raw: any): string {
  const m = getMinutesValue(raw);
  return m === null ? "S/D" : `${formatMinutes(m)}m`;
}

// ─── Partido ──────────────────────────────────────────────────────────────────

export function getOpponent(item: any): string {
  const direct =
    item?.opponent_clean ??
    item?.opponent ??
    item?.opp ??
    item?.opponent_abbr ??
    item?.matchup_opponent ??
    item?.opponent_team ??
    item?.vs_team ??
    item?.team_abbreviation_opp;

  if (direct) return String(direct).trim().toUpperCase();

  const matchup = String(item?.matchup_clean ?? item?.matchup ?? "").trim().toUpperCase();
  if (matchup.includes(" VS. ")) return matchup.split(" VS. ").pop() || "---";
  if (matchup.includes(" VS ")) return matchup.split(" VS ").pop() || "---";
  if (matchup.includes(" @ ")) return matchup.split(" @ ").pop() || "---";

  return "---";
}

export function getGameLocation(item: any): string {
  const raw = String(item?.home_away_clean ?? item?.home_away ?? "").toUpperCase();
  if (raw === "HOME") return "vs";
  if (raw === "AWAY") return "@";

  const matchup = String(item?.matchup_clean ?? item?.matchup ?? "");
  return matchup.includes("@") ? "@" : "vs";
}

// ─── Formato de fecha ─────────────────────────────────────────────────────────

export function formatDateShort(value: any): string {
  return formatDateOnly(value);
}

export function formatDateShortWithYear(value: any): string {
  return formatDateOnly(value, { year: true });
}

export function getDateKey(value: any): string | null {
  return normalizeDateOnly(value);
}

// ─── Formato de hora con fix de hidratación ───────────────────────────────────

export function formatArgTime(isoString: string | null | undefined): string {
  if (!isoString) return "";
  try {
    return new Date(isoString)
      .toLocaleTimeString("es-AR", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "America/Argentina/Buenos_Aires",
      })
      .replace(/[\u00A0\u202F]/g, " ");
  } catch {
    return "";
  }
}

// ─── Stat display ─────────────────────────────────────────────────────────────

export function formatStatValue(value: any, isPercentage?: boolean): string {
  if (value === null || value === undefined || value === "") return "S/D";
  const n = Number(value);
  if (!Number.isFinite(n)) return "S/D";
  const formatted = Number.isInteger(n) ? String(n) : n.toFixed(1);
  return isPercentage ? `${formatted}%` : formatted;
}
