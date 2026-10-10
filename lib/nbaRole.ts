export type RoleRow = Record<string, unknown>;
export type RoleMetric = { id: string; label: string; keys: string[]; percent?: boolean; minutes?: boolean; opportunity?: string };
export const ROLE_METRICS: RoleMetric[] = [
  { id: 'minutes', label: 'Minutos', keys: ['min_clean', 'minutes_clean', 'min', 'minutes', 'mins', 'minutes_played', 'mp'], minutes: true },
  { id: 'usage', label: 'Uso ofensivo', keys: ['usage_pct', 'usg_pct'], percent: true },
  { id: 'touches', label: 'Toques', keys: ['touches'] },
  { id: 'fga', label: 'Tiros intentados', keys: ['fga'] },
  { id: 'potential_ast', label: 'Asistencias potenciales', keys: ['potential_ast', 'pot_ast'], opportunity: 'ast' },
  { id: 'rebound_chances', label: 'Oportunidades de rebote', keys: ['rebound_chances', 'reb_chances'], opportunity: 'reb' },
  { id: 'fta', label: 'Tiros libres intentados', keys: ['fta'] },
  { id: 'pts', label: 'Puntos', keys: ['pts'] },
  { id: 'ast', label: 'Asistencias', keys: ['ast'] },
  { id: 'reb', label: 'Rebotes', keys: ['reb'] },
];
export function roleNumber(raw: unknown, metric?: RoleMetric): number | null {
  if (raw == null || typeof raw === 'boolean' || String(raw).trim() === '') return null;
  const text = String(raw).trim();
  let value: number;
  if (metric?.minutes && /^\d+:\d{1,2}(\.\d+)?$/.test(text)) {
    const [min, sec] = text.split(':').map(Number);
    if (sec >= 60) return null;
    value = min + sec / 60;
  } else value = Number(text.replace(/%$/, ''));
  if (!Number.isFinite(value) || value < 0) return null;
  if (metric?.percent && !text.endsWith('%') && value <= 1) value *= 100;
  if (metric?.percent && value > 100) return null;
  return value;
}
export function roleValue(row: RoleRow, metric: RoleMetric): number | null {
  for (const key of metric.keys) {
    const value = roleNumber(row[key], metric);
    if (value !== null) return value;
  }
  return null;
}
// Keep the original missing values before the legacy page replaces them with zero.
export function compactRoleRows(rows: RoleRow[]): RoleRow[] {
  return rows.map(row => ({
    game_id: row.game_id, game_date: row.game_date ?? row.date,
    season: row.season ?? row.season_id, season_type: row.season_type,
    split_code: row.split_code,
    ...Object.fromEntries(ROLE_METRICS.map(metric => {
      const value = roleValue(row, metric);
      return [metric.keys[0], metric.percent && value !== null ? `${value}%` : value];
    })),
  }));
}
function seasonKey(row: RoleRow): string {
  const explicit = String(row.season ?? row.season_year ?? '').trim();
  const match = explicit.match(/^(\d{4})(?:-\d{2,4})?$/);
  if (match) return match[1];
  if (/^2\d{4}$/.test(explicit)) return explicit.slice(1);
  const date = String(row.game_date ?? '').slice(0, 10);
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  return year > 1900 && month >= 1 && month <= 12 ? String(month >= 7 ? year : year - 1) : '';
}
export function prepareRoleSeason(rows: RoleRow[], seasonType = 'all') {
  const ordered = rows.filter(row => {
    const split = String(row.split_code ?? '').trim().toUpperCase();
    return (!split || ['FULL', 'FULL_GAME', 'GAME'].includes(split)) && (roleValue(row, ROLE_METRICS[0]) ?? 0) > 0 && Number.isFinite(Date.parse(String(row.game_date ?? '')));
  }).sort((a, b) => Date.parse(String(b.game_date)) - Date.parse(String(a.game_date)));
  const seen = new Set<string>();
  const unique = ordered.filter(row => {
    const id = String(row.game_id ?? String(row.game_date).slice(0, 10));
    if (seen.has(id)) return false;
    seen.add(id); return true;
  });
  const season = unique.length ? seasonKey(unique[0]) : '';
  const games = unique.filter(row => {
    if (!season || seasonKey(row) !== season) return false;
    const type = String(row.season_type ?? '').toLowerCase();
    return seasonType === 'all' || (seasonType === 'playoffs' ? type.includes('playoff') : type.includes('regular'));
  });
  return { season, games, label: season ? `${season}-${String(Number(season) + 1).slice(-2)}` : 'Sin temporada' };
}
export function summarizeRole(rows: RoleRow[], metric: RoleMetric, mode: 'game' | 'per36' = 'game') {
  let sum = 0, minutes = 0, count = 0, invalid = 0;
  for (const row of rows) {
    const value = roleValue(row, metric);
    if (value === null) continue;
    if (metric.opportunity) {
      const actual = roleNumber(row[metric.opportunity]);
      if (actual !== null && value < actual) { invalid++; continue; }
    }
    const time = roleValue(row, ROLE_METRICS[0]);
    if (mode === 'per36' && !metric.minutes && !metric.percent) {
      if (time === null || time <= 0) continue;
      minutes += time;
    }
    sum += value; count++;
  }
  return { value: count ? (mode === 'per36' && !metric.minutes && !metric.percent ? sum / minutes * 36 : sum / count) : null, count, total: rows.length, invalid };
}
