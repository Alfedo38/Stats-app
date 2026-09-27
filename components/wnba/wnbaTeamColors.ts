export type WNBATeamTheme = {
  primary: string;
  secondary: string;
  soft: string;
  glow: string;
  text: string;
};

export const WNBA_TEAM_COLORS: Record<string, WNBATeamTheme> = {
  ATL: { primary: "#e31837", secondary: "#c4d600", soft: "rgba(227,24,55,.07)", glow: "rgba(227,24,55,.14)", text: "#ffffff" },
  CHI: { primary: "#418fde", secondary: "#fcb514", soft: "rgba(65,143,222,.07)", glow: "rgba(65,143,222,.14)", text: "#ffffff" },
  CON: { primary: "#f05023", secondary: "#002b5c", soft: "rgba(240,80,35,.07)", glow: "rgba(240,80,35,.14)", text: "#ffffff" },
  DAL: { primary: "#c4d600", secondary: "#00a3e0", soft: "rgba(196,214,0,.07)", glow: "rgba(196,214,0,.13)", text: "#08110d" },
  GSV: { primary: "#b7ff00", secondary: "#111827", soft: "rgba(183,255,0,.065)", glow: "rgba(183,255,0,.13)", text: "#07120d" },
  IND: { primary: "#c8102e", secondary: "#041e42", soft: "rgba(200,16,46,.07)", glow: "rgba(200,16,46,.14)", text: "#ffffff" },
  LAS: { primary: "#ffc72c", secondary: "#702f8a", soft: "rgba(255,199,44,.065)", glow: "rgba(255,199,44,.13)", text: "#090909" },
  LVA: { primary: "#c8102e", secondary: "#000000", soft: "rgba(200,16,46,.07)", glow: "rgba(200,16,46,.14)", text: "#ffffff" },
  MIN: { primary: "#00a9e0", secondary: "#78be20", soft: "rgba(0,169,224,.07)", glow: "rgba(0,169,224,.14)", text: "#ffffff" },
  NYL: { primary: "#86cebc", secondary: "#ff671f", soft: "rgba(134,206,188,.07)", glow: "rgba(134,206,188,.14)", text: "#05120e" },
  PHX: { primary: "#e56020", secondary: "#3c1053", soft: "rgba(229,96,32,.07)", glow: "rgba(229,96,32,.14)", text: "#ffffff" },
  PDX: { primary: "#ef4444", secondary: "#f8fafc", soft: "rgba(239,68,68,.07)", glow: "rgba(239,68,68,.14)", text: "#ffffff" },
  SEA: { primary: "#4f8a5b", secondary: "#fee11a", soft: "rgba(79,138,91,.08)", glow: "rgba(79,138,91,.14)", text: "#ffffff" },
  TOR: { primary: "#22d3ee", secondary: "#ef4444", soft: "rgba(34,211,238,.07)", glow: "rgba(34,211,238,.14)", text: "#041014" },
  WAS: { primary: "#e03a3e", secondary: "#002b5c", soft: "rgba(224,58,62,.07)", glow: "rgba(224,58,62,.14)", text: "#ffffff" },
};

export const DEFAULT_WNBA_THEME: WNBATeamTheme = {
  primary: "#10b981",
  secondary: "#22d3ee",
  soft: "rgba(16,185,129,.07)",
  glow: "rgba(16,185,129,.14)",
  text: "#050b0a",
};

export function getWNBATeamTheme(team?: string | null): WNBATeamTheme {
  const key = String(team || "").trim().toUpperCase();
  return WNBA_TEAM_COLORS[key] || DEFAULT_WNBA_THEME;
}
