import { ROLE_METRICS, roleValue, roleNumber, type RoleRow } from './nbaRole';
export function proOpponent(row: RoleRow): string {
  const explicit = String(row.opponent_abbr ?? '').toUpperCase();
  if (explicit) return explicit;
  const own = String(row.team_abbreviation ?? '').toUpperCase();
  return String(row.matchup ?? '').toUpperCase().split(/\s+@\s+|\s+VS\.?\s+/).find(part => part && part !== own) ?? '';
}
export function paired(rows: RoleRow[], opportunity: string, actual: string) {
  const metric = ROLE_METRICS.find(m => m.id === opportunity)!;
  let count = 0, volume = 0, result = 0, invalid = 0;
  for (const row of rows) {
    const a = roleValue(row, metric), b = roleNumber(row[actual]);
    if (a === null || b === null) continue;
    if (a < b) { invalid++; continue; }
    count++; volume += a; result += b;
  }
  return { count, invalid, opportunity: count ? volume / count : null, actual: count ? result / count : null, conversion: volume > 0 ? result / volume * 100 : null };
}
export function restDays(date: string, previous: string): number | null {
  const a = Date.parse(date.slice(0, 10)), b = Date.parse(previous.slice(0, 10));
  const gap = (a - b) / 86400000;
  return Number.isInteger(gap) && gap >= 1 ? gap - 1 : null;
}
export function restGroups(rows: RoleRow[], teamDates: { team: string; date: string }[]) {
  const calendar = new Map<string, string[]>();
  for (const { team, date } of teamDates) calendar.set(team, [...(calendar.get(team) ?? []), date.slice(0,10)]);
  for (const [team, dates] of calendar) calendar.set(team, [...new Set(dates)].sort());
  const groups: { label: string; rows: RoleRow[] }[] = [{ label: 'Consecutivos (0 días libres)', rows: [] }, { label: '1 día libre', rows: [] }, { label: '2 o más días libres', rows: [] }];
  let unknown = 0;
  for (const row of rows) {
    const dates = calendar.get(String(row.team_abbreviation ?? '')) ?? [];
    const index = dates.indexOf(String(row.game_date).slice(0,10));
    const days = index > 0 ? restDays(dates[index], dates[index-1]) : null;
    if (days === null) { unknown++; continue; }
    groups[days >= 2 ? 2 : days].rows.push(row);
  }
  return { groups, unknown };
}
export type ProStint = { game_id: string; game_date: string; start_seconds: number; end_seconds: number; game_seconds: number; lineup: number[]; pts: number; reb: number; ast: number; fga: number };
export function onOff(rows: ProStint[], teammate: number) {
  return [true, false].map(on => {
    const sample = rows.filter(row => row.lineup.includes(teammate) === on);
    const minutes = sample.reduce((sum,row)=>sum+(row.end_seconds-row.start_seconds)/60,0);
    return { on, minutes, games: new Set(sample.map(row=>row.game_id)).size, values: ['pts','reb','ast','fga'].map(key=>minutes>0 ? sample.reduce((sum,row)=>sum+Number(row[key as 'pts']),0)/minutes*36:null) };
  });
}
