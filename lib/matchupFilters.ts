import { isLeagueTeam } from './teams';

export type Phase = 'ALL' | 'Regular Season' | 'Playoffs';
export type Venue = 'ALL' | 'MATCH' | 'HOME' | 'AWAY';
export type MatchupFilters = { phase: Phase; venue: Venue; last: number; season: string; date: string };
const aliases: Record<string, string> = { GS: 'GSW', NY: 'NYK', NO: 'NOP', SA: 'SAS', UTAH: 'UTA', WSH: 'WAS', PHO: 'PHX', BRK: 'BKN' };

export function canonicalTeam(value: unknown): string {
  const raw = String(value ?? '').trim().toUpperCase();
  const team = aliases[raw] ?? raw;
  return isLeagueTeam(team) ? team : '';
}

export function validDate(value: unknown): string {
  const raw = String(value ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return '';
  const date = new Date(`${raw}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === raw ? raw : '';
}

export function argentinaDate(value: string | Date = new Date()): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

export function matchupFilters(params: Record<string, string | string[] | undefined>, seasons: string[]): MatchupFilters {
  const one = (key: string) => { const v = params[key]; return Array.isArray(v) ? v[0] : v; };
  const phase = one('phase');
  const venue = one('venue');
  return {
    phase: phase === 'Regular Season' || phase === 'Playoffs' ? phase : 'ALL',
    venue: venue === 'MATCH' || venue === 'HOME' || venue === 'AWAY' ? venue : 'ALL',
    last: one('last') === '5' ? 5 : one('last') === '10' ? 10 : 0,
    season: seasons.includes(one('season') ?? '') ? one('season')! : seasons[0] ?? '2025-26',
    date: validDate(one('date')) || argentinaDate(),
  };
}

// ESPN abbreviations differ from the NBA stats/roster abbreviations.
export function buildMatchupHref(game: { date?: string; competitions?: { competitors?: { homeAway?: string; team?: { abbreviation?: string } }[] }[] }): string | null {
  const competitors = game.competitions?.[0]?.competitors ?? [];
  const home = canonicalTeam(competitors.find(c => c.homeAway === 'home')?.team?.abbreviation);
  const away = canonicalTeam(competitors.find(c => c.homeAway === 'away')?.team?.abbreviation);
  const date = game.date ? argentinaDate(game.date) : '';
  if (!home || !away || home === away || !date) return null;
  return `/partidos/${away}-${home}?${new URLSearchParams({ date, start: game.date! })}`;
}
