export type LeagueTeam = {
  id: string;
  name: string;
};

export const LEAGUE_TEAMS: LeagueTeam[] = [
  { id: "ATL", name: "Atlanta Hawks" },
  { id: "BOS", name: "Boston Celtics" },
  { id: "BKN", name: "Brooklyn Nets" },
  { id: "CHA", name: "Charlotte Hornets" },
  { id: "CHI", name: "Chicago Bulls" },
  { id: "CLE", name: "Cleveland Cavaliers" },
  { id: "DAL", name: "Dallas Mavericks" },
  { id: "DEN", name: "Denver Nuggets" },
  { id: "DET", name: "Detroit Pistons" },
  { id: "GSW", name: "Golden State Warriors" },
  { id: "HOU", name: "Houston Rockets" },
  { id: "IND", name: "Indiana Pacers" },
  { id: "LAC", name: "LA Clippers" },
  { id: "LAL", name: "Los Angeles Lakers" },
  { id: "MEM", name: "Memphis Grizzlies" },
  { id: "MIA", name: "Miami Heat" },
  { id: "MIL", name: "Milwaukee Bucks" },
  { id: "MIN", name: "Minnesota Timberwolves" },
  { id: "NOP", name: "New Orleans Pelicans" },
  { id: "NYK", name: "New York Knicks" },
  { id: "OKC", name: "Oklahoma City Thunder" },
  { id: "ORL", name: "Orlando Magic" },
  { id: "PHI", name: "Philadelphia 76ers" },
  { id: "PHX", name: "Phoenix Suns" },
  { id: "POR", name: "Portland Trail Blazers" },
  { id: "SAC", name: "Sacramento Kings" },
  { id: "SAS", name: "San Antonio Spurs" },
  { id: "TOR", name: "Toronto Raptors" },
  { id: "UTA", name: "Utah Jazz" },
  { id: "WAS", name: "Washington Wizards" },
];

export function isLeagueTeam(value?: string | null) {
  const normalized = String(value || "").toUpperCase();
  return LEAGUE_TEAMS.some((team) => team.id === normalized);
}
