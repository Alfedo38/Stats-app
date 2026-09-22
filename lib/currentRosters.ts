import rosterSnapshot from "@/data/nba_rosters_2026_27.json";

export type CurrentRosterPlayer = {
  player_id: number;
  full_name: string;
  jersey_number: string | null;
  position: string | null;
  height: string | null;
  weight: string | null;
  birthdate: string | null;
  age: number | null;
  experience: string | null;
  school: string | null;
  acquisition: string | null;
  team_abbreviation: string;
  team_id: number;
};

type RosterTeam = {
  team_abbreviation: string;
  team_id: number;
  slug: string;
  source_url: string;
  players: Omit<CurrentRosterPlayer, "team_abbreviation" | "team_id">[];
};

type RosterSnapshot = {
  snapshot_date: string;
  season: string;
  source: string;
  teams: RosterTeam[];
};

const snapshot = rosterSnapshot as RosterSnapshot;
const playersById = new Map<number, CurrentRosterPlayer>();
const playersByTeam = new Map<string, CurrentRosterPlayer[]>();

for (const team of snapshot.teams) {
  const abbr = team.team_abbreviation.toUpperCase();
  const players = team.players.map((player) => ({
    ...player,
    height: /\d/.test(String(player.height || "")) ? player.height : null,
    weight: /\d/.test(String(player.weight || "")) ? player.weight : null,
    team_abbreviation: abbr,
    team_id: team.team_id,
  }));
  playersByTeam.set(abbr, players);
  for (const player of players) playersById.set(player.player_id, player);
}

export const CURRENT_ROSTER_SEASON = snapshot.season;
export const CURRENT_ROSTER_UPDATED_AT = snapshot.snapshot_date;

export function getCurrentRosterPlayer(playerId: number | string) {
  return playersById.get(Number(playerId)) ?? null;
}

export function getCurrentRosterPlayers(teams: string[]) {
  const uniqueTeams = Array.from(
    new Set(teams.map((team) => String(team || "").trim().toUpperCase()).filter(Boolean)),
  );
  return uniqueTeams.flatMap((team) => playersByTeam.get(team) ?? []);
}

export function getCurrentRosterTeam(team: string) {
  return playersByTeam.get(String(team || "").trim().toUpperCase()) ?? [];
}

export function getAllCurrentRosterPlayers() {
  return Array.from(playersById.values());
}
