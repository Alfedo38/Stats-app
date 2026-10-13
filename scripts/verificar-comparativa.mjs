import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const moduleFrom = source => import('data:text/javascript;base64,' + Buffer.from(stripTypeScriptTypes(source)).toString('base64'));
const filters = await moduleFrom(read('lib/matchupFilters.ts').replace("'./teams'", JSON.stringify(new URL('lib/teams.ts', root).href)));
assert.equal(filters.canonicalTeam('gs'), 'GSW');
assert.equal(filters.canonicalTeam('NY'), 'NYK');
assert.equal(filters.canonicalTeam('NO'), 'NOP');
assert.equal(filters.canonicalTeam('SA'), 'SAS');
assert.equal(filters.canonicalTeam('unknown'), '');
assert.equal(filters.validDate('2026-02-30'), '');
assert.equal(filters.argentinaDate('2026-10-14T01:00:00Z'), '2026-10-13');
assert.deepEqual(filters.matchupFilters({ season: '1900-01', phase: 'anything', last: '-5', venue: 'x', date: '2026-04-09' }, ['2025-26']), { season: '2025-26', phase: 'ALL', last: 0, venue: 'ALL', date: '2026-04-09' });
const fixture = { date: '2026-10-14T01:00:00Z', competitions: [{ competitors: [{ homeAway: 'away', team: { abbreviation: 'GS' } }, { homeAway: 'home', team: { abbreviation: 'NY' } }] }] };
assert.match(filters.buildMatchupHref(fixture), /^\/partidos\/GSW-NYK\?date=2026-10-13&/);
assert.equal(filters.buildMatchupHref({ date: 'bad' }), null);
console.log('OK: aliases, fechas ARG, parámetros inválidos y enlaces.');

// Render parameterized Prisma SQL without connecting to a database.
const fragment = (strings, ...values) => {
  let text = '', params = [];
  strings.forEach((s, i) => {
    text += s;
    if (i < values.length) {
      const v = values[i];
      if (v && typeof v === 'object' && 'text' in v) { text += v.text; params.push(...v.params); }
      else { text += '?'; params.push(v); }
    }
  });
  return { text, params };
};
const requests = [];
globalThis.__matchupTest = {
  prisma: { $queryRaw: async query => { requests.push(query); return []; } },
  Prisma: { sql: fragment, empty: { text: '', params: [] }, join: values => ({ text: values.map(() => '?').join(','), params: values }) },
  roster: team => [{ player_id: team === 'ATL' ? 1 : 2 }],
};
const source = read('lib/matchupData.ts')
  .replace("import prisma from '@/lib/prisma';", 'const prisma = globalThis.__matchupTest.prisma;')
  .replace("import { Prisma } from '@prisma/client';", 'const Prisma = globalThis.__matchupTest.Prisma;')
  .replace("import { getCurrentRosterTeam } from '@/lib/currentRosters';", 'const getCurrentRosterTeam = globalThis.__matchupTest.roster;');
const data = await moduleFrom(source);
const cases = [];
for (const variant of [
  { last: 5, venue: 'ALL', phase: 'Regular Season' },
  { last: 5, venue: 'MATCH', phase: 'Regular Season' },
  { last: 0, venue: 'ALL', phase: 'Playoffs' },
  { last: 10, venue: 'HOME', phase: 'ALL' },
]) {
  requests.length = 0;
  await data.getMatchupData('ATL', 'BOS', { ...variant, season: '2025-26', date: '2026-04-09' });
  assert.equal(requests.length, 2);
  cases.push({ variant, queries: [...requests] });
}
const python = String.raw`
import json, sqlite3, sys
cases = json.load(sys.stdin)
db = sqlite3.connect(':memory:')
db.row_factory = sqlite3.Row
db.execute('CREATE TABLE nba_team_game_logs (game_id TEXT, team_id INT, season_year TEXT, season_type TEXT, game_date TEXT, team_abbreviation TEXT, home_away TEXT, opponent_team_id INT, wl TEXT, pts REAL, reb REAL, ast REAL, stl REAL, blk REAL, tov REAL, fgm REAL, fga REAL, fg3m REAL, fg3a REAL, ftm REAL, fta REAL)')
db.execute('CREATE TABLE player_game_logs (id INT, player_id INT, game_id INT, game_date TEXT, season_year TEXT, season_type TEXT, team_abbreviation TEXT, matchup TEXT, min REAL, pts REAL, reb REAL, ast REAL, fg3m REAL, fgm REAL, fga REAL, stl REAL, blk REAL, tov REAL)')
for i in range(1, 10):
    date = f'2026-04-{i:02d}'
    for team_id, team, other, player, base in [(10,'ATL',20,1,100),(20,'BOS',10,2,200)]:
        venue = ('AWAY' if i % 2 else 'HOME') if team == 'ATL' else ('HOME' if i % 2 else 'AWAY')
        values = [str(i),team_id,'2025-26','Regular Season',date,team,venue,other,'W',base+i,40,20,5,3,10,10,i*10,3,10,5,8]
        db.execute('INSERT INTO nba_team_game_logs VALUES (' + ','.join('?' for _ in values) + ')', values)
        match = f'{team} @ X' if venue == 'AWAY' else f'{team} vs. X'
        values = [i*10+player,player,i,date,'2025-26','Regular Season',team,match,30,i,4,3,2,3,8,1,1,2]
        db.execute('INSERT INTO player_game_logs VALUES (' + ','.join('?' for _ in values) + ')', values)
# A duplicate player/game row must not increase sample size.
db.execute('INSERT INTO player_game_logs SELECT 999,player_id,game_id,game_date,season_year,season_type,team_abbreviation,matchup,min,pts,reb,ast,fg3m,fgm,fga,stl,blk,tov FROM player_game_logs WHERE player_id=1 AND game_id=8')
# DNP and future records must not affect averages.
db.execute("INSERT INTO player_game_logs VALUES (1000,1,77,'2026-04-08','2025-26','Regular Season','ATL','ATL @ X',0,999,99,99,99,99,99,99,99,99)")
import re
for case in cases:
    results=[]
    for query in case['queries']:
        sql=query['text'].replace('public.', '')
        # SQLite equivalent of PostgreSQL DISTINCT ON for fixture validation.
        sql=sql.replace('SELECT DISTINCT ON (player_id, game_id)', 'SELECT')
        sql=sql.replace('ORDER BY player_id, game_id, id DESC', 'AND id = (SELECT max(latest.id) FROM player_game_logs latest WHERE latest.player_id = player_game_logs.player_id AND latest.game_id = player_game_logs.game_id) ORDER BY player_id, game_id, id DESC')
        sql=re.sub(r'::(float8|int|text|date)\b','',sql)
        sql=sql.replace("string_agg(DISTINCT team_abbreviation, ', ' ORDER BY team_abbreviation)", 'group_concat(DISTINCT team_abbreviation)')
        results.append([dict(r) for r in db.execute(sql,query['params'])])
    variant=case['variant']
    if variant['phase']=='Playoffs':
        assert results == [[],[]], results
    elif variant['venue']=='ALL':
        atl=next(r for r in results[0] if r['team_abbreviation']=='ATL')
        p=next(r for r in results[1] if r['player_id']==1)
        assert atl['gp']==5 and atl['pts']==106 and atl['opp_pts']==206, atl
        assert abs(atl['fg_pct'] - 100*50/300) < 1e-6, atl
        assert p['gp']==5 and p['pts']==6 and p['pra']==13 and p['last_date']=='2026-04-08', p
    elif variant['venue']=='MATCH':
        assert all(r['gp']==4 for r in results[0]), results
        assert all(r['gp']==4 for r in results[1]), results
    elif variant['venue']=='HOME':
        assert all(r['gp']==4 for r in results[0]), results
        assert all(r['gp']==4 for r in results[1]), results
print('OK: SQL de promedios, filtros antes de ventana, porcentajes ponderados, rival, sin duplicados/DNP/futuro y fases vacías.')
`;
const run = spawnSync('python3', ['-c', python], { input: JSON.stringify(cases), encoding: 'utf8' });
process.stdout.write(run.stdout);
if (run.status !== 0) { process.stderr.write(run.stderr); process.exit(run.status || 1); }
const carousel = read('components/GameCarousel.tsx');
assert.ok(carousel.includes('href={href}'));
assert.ok(!carousel.includes('href={`/teams/${abbr}`}'));
assert.ok(read('app/partidos/[matchup]/page.tsx').includes('await requirePageUser()'));
console.log('OK: navegación del partido y protección de sesión.');
