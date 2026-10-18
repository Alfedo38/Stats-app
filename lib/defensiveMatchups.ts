export type MatchupRosterPlayer = { player_id: number; full_name: string; position: string | null };
export type MatchupAverage = { player_id: number; min: number | null };
export type DefensiveAssignment = { attackerId: number | null; defenderId: number | null; origin: 'suggested' | 'manual' | 'pending' };
export type DefensiveScenario = { version: 1; excluded: number[]; away: DefensiveAssignment[]; home: DefensiveAssignment[] };

export function rankedMatchupRoster(roster: MatchupRosterPlayer[], averages: MatchupAverage[], excluded: number[] = []) {
  const minutes = new Map(averages.map(player => [player.player_id, player.min]));
  const absent = new Set(excluded);
  return roster.filter(player => !absent.has(player.player_id)).slice().sort((a, b) =>
    (minutes.get(b.player_id) ?? -1) - (minutes.get(a.player_id) ?? -1) || a.full_name.localeCompare(b.full_name)
  );
}

function positions(value: string | null): number[] {
  const text = String(value ?? '').trim().toUpperCase();
  const names: Record<string, number[]> = { PG: [0], SG: [1], SF: [2], PF: [3], C: [4], G: [0, 1], F: [2, 3], GUARD: [0, 1], FORWARD: [2, 3], CENTER: [4], 'POINT GUARD': [0], 'SHOOTING GUARD': [1], 'SMALL FORWARD': [2], 'POWER FORWARD': [3] };
  return [...new Set(text.split(/[-/,]/).flatMap(part => names[part.trim()] ?? []))];
}

function suggestSide(attackers: MatchupRosterPlayer[], defenders: MatchupRosterPlayer[]): DefensiveAssignment[] {
  const used = new Set<number>();
  return Array.from({ length: 5 }, (_, index): DefensiveAssignment => {
    const attacker = attackers[index];
    if (!attacker) return { attackerId: null, defenderId: null, origin: 'pending' };
    const attackingPositions = positions(attacker.position);
    const options = defenders.slice(0, 5).map((player, rank) => {
      const defensivePositions = positions(player.position);
      const distance = attackingPositions.length && defensivePositions.length
        ? Math.min(...attackingPositions.flatMap(a => defensivePositions.map(d => Math.abs(a - d)))) : 4;
      return { player, score: distance * 100 + rank };
    }).filter(option => !used.has(option.player.player_id)).sort((a, b) => a.score - b.score);
    const defender = options[0]?.player;
    if (defender) used.add(defender.player_id);
    return { attackerId: attacker.player_id, defenderId: defender?.player_id ?? null, origin: defender ? 'suggested' : 'pending' };
  });
}

export function suggestDefensiveScenario(awayRoster: MatchupRosterPlayer[], homeRoster: MatchupRosterPlayer[], averages: MatchupAverage[], excluded: number[] = []): DefensiveScenario {
  const allowed = new Set([...awayRoster, ...homeRoster].map(player => player.player_id));
  const absent = [...new Set(excluded)].filter(id => allowed.has(id));
  const away = rankedMatchupRoster(awayRoster, averages, absent);
  const home = rankedMatchupRoster(homeRoster, averages, absent);
  return { version: 1, excluded: absent, away: suggestSide(away, home), home: suggestSide(home, away) };
}

export function restoreDefensiveScenario(value: unknown, awayRoster: MatchupRosterPlayer[], homeRoster: MatchupRosterPlayer[], averages: MatchupAverage[]): DefensiveScenario {
  const fallback = () => suggestDefensiveScenario(awayRoster, homeRoster, averages);
  if (!value || typeof value !== 'object') return fallback();
  const raw = value as Record<string, unknown>;
  if (raw.version !== 1 || !Array.isArray(raw.away) || raw.away.length !== 5 || !Array.isArray(raw.home) || raw.home.length !== 5 || !Array.isArray(raw.excluded)) return fallback();
  const all = new Set([...awayRoster, ...homeRoster].map(player => player.player_id));
  const excluded = [...new Set(raw.excluded.filter((id): id is number => typeof id === 'number' && all.has(id)))];
  const absent = new Set(excluded);
  const side = (rows: unknown[], attackers: MatchupRosterPlayer[], defenders: MatchupRosterPlayer[]): DefensiveAssignment[] => {
    const attackIds = new Set(attackers.map(player => player.player_id));
    const defendIds = new Set(defenders.map(player => player.player_id));
    const used = new Set<number>();
    return rows.map((value): DefensiveAssignment => {
      const row = value && typeof value === 'object' ? value as Record<string, unknown> : {};
      const attackerId = typeof row.attackerId === 'number' && attackIds.has(row.attackerId) && !absent.has(row.attackerId) && !used.has(row.attackerId) ? row.attackerId : null;
      if (attackerId !== null) used.add(attackerId);
      const defenderId = attackerId !== null && typeof row.defenderId === 'number' && defendIds.has(row.defenderId) && !absent.has(row.defenderId) ? row.defenderId : null;
      return { attackerId, defenderId, origin: attackerId === null || defenderId === null ? 'pending' : row.origin === 'suggested' ? 'suggested' : 'manual' };
    });
  };
  return { version: 1, excluded, away: side(raw.away, awayRoster, homeRoster), home: side(raw.home, homeRoster, awayRoster) };
}

export function defensiveScenarioKey(away: string, home: string, date: string) {
  return `moskprops:defensive-matchups:v1:${away}:${home}:${date}`;
}
