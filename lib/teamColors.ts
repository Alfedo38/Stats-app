// lib/teamColors.ts
// Paleta de colores NBA — sin logos, sin imágenes.
// Usado en GameCarousel, PlayerHeader, TeamMatesPanel y cualquier
// componente que necesite identidad visual de equipo.

export const NBA_TEAM_COLORS: Record<string, string> = {
  ATL: "#C8102E", BOS: "#007A33", BKN: "#444444", CHA: "#1D1160",
  CHI: "#CE1141", CLE: "#860038", DAL: "#00538C", DEN: "#0E2240",
  DET: "#C8102E", GSW: "#1D428A", HOU: "#CE1141", IND: "#002D62",
  LAC: "#C8102E", LAL: "#552583", MEM: "#5D76A9", MIA: "#98002E",
  MIL: "#00471B", MIN: "#0C2340", NOP: "#0C2340", NYK: "#006BB6",
  OKC: "#007AC1", ORL: "#0077C0", PHI: "#006BB6", PHX: "#E56020",
  POR: "#E03A3E", SAC: "#5A2D81", SAS: "#8A8D8F", TOR: "#CE1141",
  UTA: "#002B5C", WAS: "#002B5C",
};

export function getTeamColor(abbr?: string | null): string {
  if (!abbr) return "#10b981";
  return NBA_TEAM_COLORS[abbr.toUpperCase()] ?? "#10b981";
}

export function getTeamColorMuted(abbr?: string | null, opacity = 0.15): string {
  const hex = getTeamColor(abbr);
  return `${hex}${Math.round(opacity * 255).toString(16).padStart(2, "0")}`;
}
