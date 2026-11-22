import {getMinutesValue} from './formatters';
import {defenseReferencePosition,defenseSeason,type DefenseGroup} from './nbaDefense';
import {gamePhase} from './nbaGameFilters';
import {getOpponent} from './playerUtils';
import {finiteStat} from './selectionStats';
import {isDate,TEAMS} from './ticketReader/model';

export const MATCHUP_STATS = ['pts', 'reb', 'ast'] as const;
export type MatchupStat = typeof MATCHUP_STATS[number];
export type MatchupPhase = 'Regular Season' | 'Playoffs';
export type MatchupTarget = {
  playerId: number;
  team: string;
  opponent: string;
  cutoff: string;
  phase: MatchupPhase;
  position: string | null;
};
type Values = Record<MatchupStat, number | null>;
type Group = DefenseGroup;
type PlayerGame = {id: string; date: string; season: string; phase: MatchupPhase; team: string; opponent: string; minutes: number; values: Values};
type DefenseGame = {id: string; date: string; team: string; season: string; phase: MatchupPhase; groups: Partial<Record<Group, Values>>};
type Row = Record<string, unknown>;
type Timeline = {dates: string[]; totals: Record<MatchupStat, number[]>; counts: Record<MatchupStat, number[]>};
type Index = Map<string, Map<string, Timeline>>;
type DefenseEvidence = {group: Group; opponentAllowed: number; leagueAllowed: number; differencePct: number;
  appliedPct: number; games: number; total: number; teams: number; through: string};
type Baseline = {value: number; games: number; total: number; minutes: number; through: string};
type Validation = {games: number; referenceError: number | null; adjustedError: number | null; improved: boolean};
export type MatchupEstimate = {
  stat: MatchupStat;
  base: Baseline | null;
  defense: DefenseEvidence | null;
  adjusted: number | null;
  delta: number | null;
  direction: 'favorable' | 'demanding' | 'neutral' | 'unknown';
  kind: 'estimate' | 'scenario' | 'reference';
  validation: Validation;
};
export type MatchupFavorability = {season: string; metrics: MatchupEstimate[]};

const BASE_GAMES = 10, MIN_BASE = 5, MIN_RIVAL = 8, PRIOR_GAMES = 12, MIN_VALIDATION = 20;
const MAX_CHANGE = 0.15, MAX_GAP_RIVAL = 21, MAX_GAP_PLAYER = 45;
const THRESHOLDS: Record<MatchupStat, number> = {pts: 0.4, reb: 0.2, ast: 0.2};
const keys = new Set(TEAMS), phases = ['Regular Season', 'Playoffs'];
const object = (x: unknown): x is Row => !!x && typeof x === 'object' && !Array.isArray(x);
const idFor = (x: unknown) => {
  const s = String(x ?? '').trim().padStart(10, '0');
  return /^00[24]\d{7}$/.test(s) ? s : null;
};
const mean = (v: number[]) => v.reduce((n, item) => n + item, 0) / v.length;
const round = (n: number) => Math.round(n * 10) / 10 || 0;
const adjustedValue = (base: Baseline, defense: DefenseEvidence) => round(base.value*(1+defense.appliedPct/100));
const since = (a: string, b: string) => (Date.parse(a) - Date.parse(b)) / 86_400_000;
const seriesKey = (season: string, phase: MatchupPhase, group: Group) => [season, phase, group].join('/');
const byDate = (a: {date: string; id: string}, b: {date: string; id: string}) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id);

function metrics(row: Row, max: number): Values {
  const valid = (raw: unknown) => {
    const n = finiteStat(raw);
    return n !== null && Number.isInteger(n) && n >= 0 && n <= max ? n : null;
  };
  return {pts: valid(row.pts), reb: valid(row.reb), ast: valid(row.ast)};
}

// Todos los hechos son anteriores a la fecha NBA del partido; los filtros gráficos no intervienen.
function ownGames(raw: unknown, target: Pick<MatchupTarget,'playerId'|'cutoff'>): PlayerGame[] {
  if (!Array.isArray(raw) || raw.length > 2500) return [];
  const unique = new Map<string, PlayerGame>(), conflicts = new Set<string>();
  for (const r of raw) {
    if (!object(r) || String(r.player_id) !== String(target.playerId) ||
        [r.period_scope, r.split_code].some(x => x != null && !['FULL', 'FULL_GAME'].includes(String(x).toUpperCase()))) continue;
    const date = String(r.game_date ?? '').slice(0, 10), id = idFor(r.game_id), opponent = getOpponent(r);
    const team = String(r.team_abbreviation ?? r.team_abbr ?? '').trim().toUpperCase();
    const phase = gamePhase(r), minutes = getMinutesValue(r);
    if (!id || !isDate(date) || date >= target.cutoff || !keys.has(team) || !keys.has(opponent) || opponent === team ||
        !phases.includes(String(phase)) || gamePhase({game_id: id}) !== phase || minutes === null || minutes <= 0 || minutes > 88) continue;
    const game = {id, date, season: defenseSeason(date), phase: phase as MatchupPhase, team, opponent, minutes, values: metrics(r, 150)};
    const old = unique.get(id);
    if (old && JSON.stringify(old) !== JSON.stringify(game)) conflicts.add(id);
    else unique.set(id, game);
  }
  return [...unique.values()].filter(g => !conflicts.has(g.id)).sort(byDate);
}

export function matchupTeam(raw: unknown, playerId: number, cutoff: string, rosterTeam: string|null, rosterAt: string) {
  const last=ownGames(raw,{playerId,cutoff}).at(-1);
  const roster=rosterTeam && keys.has(rosterTeam) && isDate(rosterAt) && rosterAt<=cutoff &&
    defenseSeason(rosterAt)===defenseSeason(cutoff) && since(cutoff,rosterAt)<=30;
  if (last && since(cutoff,last.date)<=21 && (!roster || last.date>rosterAt)) return last.team;
  return roster?rosterTeam:null;
}

function timelineIndex(snapshots: unknown[], groups: Group[], cutoff: string): Index {
  const result: Index = new Map();
  const unique = new Map<string, DefenseGame>(), conflicts = new Set<string>();
  for (const snap of snapshots) {
    if (!object(snap) || snap.format !== 1 || snap.scope !== 'FULL' ||
        !Array.isArray(snap.games) || snap.games.length > 15000) continue;
    for (const r of snap.games) {
      if (!object(r) || !object(r.groups) || typeof r.team !== 'string' || !keys.has(r.team) ||
          !isDate(r.date) || r.date >= cutoff || r.season !== snap.season ||
          r.season !== defenseSeason(r.date) || !phases.includes(String(r.phase))) continue;
      const id = idFor(r.id);
      if (!id || gamePhase({game_id: id}) !== r.phase) continue;
      const selected: DefenseGame['groups'] = {};
      for (const group of groups) {
        const raw = r.groups[group];
        if (object(raw)) selected[group] = metrics(raw, 230);
      }
      const game = {id, date: r.date, team: r.team, season: r.season, phase: r.phase as MatchupPhase, groups: selected};
      const key = game.team + ':' + id, old = unique.get(key);
      if (old && JSON.stringify(old) !== JSON.stringify(game)) conflicts.add(key);
      else unique.set(key, game);
    }
  }
  for (const game of [...unique.values()].filter(r => !conflicts.has(r.team + ':' + r.id)).sort(byDate)) {
    for (const group of groups) {
      const key = seriesKey(game.season, game.phase, group);
      if (!result.has(key)) result.set(key, new Map());
      const teams = result.get(key)!;
      if (!teams.has(game.team)) teams.set(game.team, {dates: [], totals: {pts:[0], reb:[0], ast:[0]}, counts: {pts:[0], reb:[0], ast:[0]}});
      const timeline = teams.get(game.team)!;
      timeline.dates.push(game.date);
      for (const stat of MATCHUP_STATS) {
        const value = game.groups[group]?.[stat];
        timeline.totals[stat].push(timeline.totals[stat].at(-1)! + (value ?? 0));
        timeline.counts[stat].push(timeline.counts[stat].at(-1)! + (value == null ? 0 : 1));
      }
    }
  }
  return result;
}

function before(dates: string[], cutoff: string) {
  let l=0, r=dates.length;
  while (l<r) {
    const m=(l+r) >>> 1;
    if (dates[m]<cutoff) l=m+1; else r=m;
  }
  return l;
}

function evidence(index: Index, group: Group, season: string, phase: MatchupPhase, opponent: string, cutoff: string, stat: MatchupStat): DefenseEvidence | null {
  const timelines = index.get(seriesKey(season, phase, group));
  if (!timelines?.has(opponent)) return null;
  let count=0, total=0, teams=0, away: {games: number; total: number; allowed: number; through: string} | null=null;
  for (const [team, series] of timelines) {
    const end=before(series.dates, cutoff), games=series.counts[stat][end], sum=series.totals[stat][end];
    if (games<6 || games/end<.75) continue;
    teams++;count+=games;total+=sum;
    if (team===opponent && games>=MIN_RIVAL) {
      let last=end;
      while (last>0 && series.counts[stat][last-1]===games) last--;
      const through=series.dates[last-1];
      if (through && since(cutoff,through)<=MAX_GAP_RIVAL) away={games,total:end,allowed:sum/games,through};
    }
  }
  if (!away || teams<(phase==='Playoffs'?8:24) || total<=0) return null;
  const leagueAllowed = total/count, difference = away.allowed/leagueAllowed-1;
  const shrunk = difference*away.games/(away.games+PRIOR_GAMES);
  return {group, opponentAllowed:away.allowed, leagueAllowed, differencePct:difference*100,
    appliedPct:Math.max(-MAX_CHANGE, Math.min(MAX_CHANGE, shrunk))*100, games:away.games,
    total:away.total, through:away.through, teams};
}

function baseline(history: PlayerGame[], season: string, phase: MatchupPhase, cutoff: string, stat: MatchupStat): Baseline | null {
  const recent = history.filter(g => g.season===season && g.phase===phase && g.date<cutoff).slice(-BASE_GAMES);
  const valid = recent.filter(g => g.values[stat]!==null);
  if (valid.length<MIN_BASE || valid.length/recent.length<.7 || since(cutoff, valid.at(-1)!.date)>MAX_GAP_PLAYER) return null;
  return {value:mean(valid.map(g => g.values[stat]!)), games:valid.length, total:recent.length,
    minutes:mean(valid.map(g => g.minutes)), through:valid.at(-1)!.date};
}

function validate(history: PlayerGame[], index: Index, phase: MatchupPhase, group: Group, stat: MatchupStat): Validation {
  const reference: number[] = [], adjusted: number[] = [];
  for (const game of history.filter(g => g.phase===phase).slice(-82)) {
    const actual=game.values[stat];
    if (actual===null) continue;
    const base=baseline(history,game.season,phase,game.date,stat);
    if (!base) continue;
    const defense=evidence(index,group,game.season,phase,game.opponent,game.date,stat);
    if (!defense) continue;
    reference.push(Math.abs(actual-round(base.value)));
    adjusted.push(Math.abs(actual-adjustedValue(base,defense)));
  }
  const a=reference.length?mean(reference):null, b=adjusted.length?mean(adjusted):null;
  return {games:reference.length,referenceError:a,adjustedError:b,
    improved:reference.length>=MIN_VALIDATION && a!==null && b!==null && a-b>=Math.max(.05,a*.02)};
}

export function matchupFavorability(target: MatchupTarget, rawFacts: unknown, snapshots: unknown[]): MatchupFavorability {
  const season=defenseSeason(target.cutoff);
  const games=ownGames(rawFacts,target);
  const history=games.slice(games.findLastIndex(g=>g.team!==target.team)+1);
  const reference=defenseReferencePosition(target.position) ?? 'ALL';
  const index=timelineIndex(snapshots,reference==='ALL'?['ALL']:[reference,'ALL'],target.cutoff);
  const metrics=MATCHUP_STATS.map((stat): MatchupEstimate => {
    const base=baseline(history,season,target.phase,target.cutoff,stat);
    const get=(group: Group) => evidence(index,group,season,target.phase,target.opponent,target.cutoff,stat);
    const defense=get(reference) ?? (reference==='ALL'?null:get('ALL'));
    const validation=base && defense?validate(history,index,target.phase,defense.group,stat):
      {games:0,referenceError:null,adjustedError:null,improved:false};
    const adjusted=base && defense?adjustedValue(base,defense):null;
    const delta=base && adjusted!==null?round(adjusted-round(base.value)):null;
    const direction=delta===null?'unknown':Math.abs(delta)<THRESHOLDS[stat]?'neutral':delta>0?'favorable':'demanding';
    return {stat,base,defense,adjusted,delta,direction,kind:adjusted===null||delta===0?'reference':validation.improved?'estimate':'scenario',validation};
  });
  return {season, metrics};
}
