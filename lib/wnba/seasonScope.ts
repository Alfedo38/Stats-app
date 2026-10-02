export function normalizeSeasonType(value: string) {
  return value === "Regular Season" || value === "Playoffs" ? value : "ALL";
}

export function seasonTypes(value: string) {
  return value === "ALL" ? ["Regular Season", "Playoffs"] : [value];
}

export function uniqueRows<T>(rows: T[], key: (row: T) => string): T[] {
  return Array.from(new Map(rows.map((row) => [key(row), row])).values());
}

// Season-view statistics are per-game averages: weight them by games played.
// This also combines directory/roster rows without showing a player twice.
export function combineSeasonRows<T extends {
  player_id: number; gp?: number | null; season_type?: string | null;
  team_abbr?: string | null;
}>(rows: T[], metrics: readonly string[]): T[] {
  const groups = new Map<number, T[]>();
  for (const row of uniqueRows(rows, (r) => `${r.player_id}:${r.team_abbr}:${r.season_type}`)) {
    const group = groups.get(row.player_id) ?? [];
    group.push(row);
    groups.set(row.player_id, group);
  }
  return Array.from(groups.values(), (group) => {
    const metadata = group.find((row) => row.season_type === "Playoffs") ?? group[0];
    const combined = { ...metadata, gp: group.reduce((sum, row) => sum + Number(row.gp || 0), 0) };
    const values = combined as Record<string, unknown>;
    for (const metric of metrics) {
      let total = 0;
      let games = 0;
      for (const row of group) {
        const value = (row as Record<string, unknown>)[metric];
        const weight = Number(row.gp || 0);
        if (value != null && Number.isFinite(Number(value)) && weight > 0) {
          total += Number(value) * weight;
          games += weight;
        }
      }
      values[metric] = games ? total / games : null;
    }
    return combined as T;
  });
}

type PageResult<T> = { data: T[] | null; error: { message: string } | null };
type PagedQuery<T> = { range: (from: number, to: number) => PromiseLike<PageResult<T>> };

// Respect Supabase's default 1000-row response cap for shots and team logs.
// The caller supplies a stable, unique ordering and a fresh query per page.
export async function readAllRows<T>(buildQuery: () => PagedQuery<T>): Promise<PageResult<T>> {
  const data: T[] = [];
  const pageSize = 500;
  for (let offset = 0; ; offset += pageSize) {
    const page = await buildQuery().range(offset, offset + pageSize - 1);
    if (page.error) return { data: null, error: page.error };
    data.push(...(page.data ?? []));
    if ((page.data?.length ?? 0) < pageSize) return { data, error: null };
  }
}
