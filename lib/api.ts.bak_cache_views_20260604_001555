import prisma from './prisma';
import { Prisma } from '@prisma/client';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

// ─── Helpers de fecha ─────────────────────────────────────────────────────────

const ARG_TZ = 'America/Argentina/Buenos_Aires';

function formatArgDateKey(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: ARG_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const year = parts.find(p => p.type === 'year')?.value;
  const month = parts.find(p => p.type === 'month')?.value;
  const day = parts.find(p => p.type === 'day')?.value;

  if (!year || !month || !day) {
    throw new Error('No pude formatear la fecha de Argentina');
  }

  return `${year}-${month}-${day}`;
}

function addDaysToDateKey(dateStr: string, offset: number): string {
  const [year, month, day] = dateStr.split('-').map(Number);

  // Usamos mediodía UTC para evitar que el cambio de zona horaria lo mande
  // al día anterior/siguiente al formatear en Argentina.
  const d = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  d.setUTCDate(d.getUTCDate() + offset);

  return formatArgDateKey(d);
}

function getArgDateStr(offset: number = 0): string {
  const todayArg = formatArgDateKey(new Date());
  return offset === 0 ? todayArg : addDaysToDateKey(todayArg, offset);
}

function normalizeDateKey(value: any): string | null {
  if (!value) return null;

  const raw = String(value);
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) return match[1];

  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;

  return formatArgDateKey(d);
}


// ─── Helpers de normalización de jugador / mercado ───────────────────────────

function normalizePlayerName(value: string | null | undefined): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['’`´]/g, '')
    .replace(/[^a-zA-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function toNumber(value: any, fallback = 0): number {
  if (value === null || value === undefined || value === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function statToPropType(stat: string | null | undefined): string {
  const key = String(stat || 'pts').toLowerCase();
  const map: Record<string, string> = {
    pts: 'PTS',
    ast: 'AST',
    reb: 'REB',
    fgm: 'FGM',
    fga: 'FGA',
    fg3m: '3PT',
    '3pt': '3PT',
    '3ptm': '3PT',
    'pts+ast': 'PA',
    'pts+reb': 'PR',
    'reb+ast': 'RA',
    'pts+reb+ast': 'PRA',
  };
  return map[key] || key.toUpperCase();
}

function getLogStatValue(log: any, stat: string | null | undefined): number {
  const key = String(stat || 'pts').toLowerCase();
  const pts = toNumber(log?.pts);
  const reb = toNumber(log?.reb);
  const ast = toNumber(log?.ast);

  if (key === 'pts+ast' || key === 'pa') return pts + ast;
  if (key === 'pts+reb' || key === 'pr') return pts + reb;
  if (key === 'reb+ast' || key === 'ra') return reb + ast;
  if (key === 'pts+reb+ast' || key === 'pra') return pts + reb + ast;
  if (key === 'fg3m' || key === '3pt' || key === '3ptm') return toNumber(log?.fg3m);
  if (key === 'fg3a' || key === '3pta') return toNumber(log?.fg3a);
  if (key === 'to') return toNumber(log?.tov ?? log?.to);

  return toNumber(log?.[key]);
}

function normalizeTeamAbbr(value: string | null | undefined): string {
  return String(value || '').trim().toUpperCase();
}

// ─── Merge de resultados en bloques ──────────────────────────────────────────

function mergeResultsIntoBlocks(jsonData: any[], resultsData: any): any[] {
  if (!jsonData) return [];
  if (!resultsData?.blocks) return jsonData;

  const lookup: Record<string, Record<string, Record<number, string>>> = {};
  for (const block of resultsData.blocks) {
    lookup[block.matchup] = {};
    for (const ticket of block.tickets || []) {
      lookup[block.matchup][ticket.name] = {};
      for (const play of ticket.plays || []) {
        lookup[block.matchup][ticket.name][Number(play.player_id)] = play.result;
      }
    }
  }

  return jsonData.map((block: any) => ({
    ...block,
    tickets: (block.tickets || []).map((ticket: any) => ({
      ...ticket,
      plays: (ticket.plays || []).map((play: any) => {
        const result = lookup[block.matchup]?.[ticket.name]?.[Number(play.player_id)];
        return {
          ...play,
          resultado:
            result === 'WIN'  ? true  :
            result === 'LOSS' ? false :
            null,
        };
      }),
    })),
  }));
}

// ─── Fetch genérico de picks por tabla y fecha ────────────────────────────────

async function fetchPicksFromTable(
  table: 'ludo_picks' | 'betano_picks',
  dateStr: string
): Promise<any[] | null> {
  const { data, error } = await supabase
    .from(table)
    .select('json_data, results_data, status, pick_date')
    .eq('pick_date', dateStr)
    .in('status', ['ACTIVE', 'PENDING', 'SETTLED', 'PARTIAL'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return mergeResultsIntoBlocks(data.json_data || [], data.results_data);
}

// ─── Helper para separar bloques por game_date ───────────────────────────────

async function getPicksForDates(table: 'ludo_picks' | 'betano_picks') {
  const yesterdayStr = getArgDateStr(-1);
  const todayStr     = getArgDateStr(0);
  const tomorrowStr  = getArgDateStr(1);

  let data: any[] = [];
  let error = null;

  try {
    // Leemos directo con Prisma para evitar inconsistencias de cache del cliente Supabase.
    if (table === 'ludo_picks') {
      data = await prisma.$queryRaw`
        SELECT json_data, results_data, status, pick_date::text, created_at
        FROM ludo_picks
        WHERE status IN ('ACTIVE', 'PENDING', 'SETTLED', 'PARTIAL')
        ORDER BY pick_date DESC, created_at DESC
        LIMIT 20
      `;
    } else {
      data = await prisma.$queryRaw`
        SELECT json_data, results_data, status, pick_date::text, created_at
        FROM betano_picks
        WHERE status IN ('ACTIVE', 'PENDING', 'SETTLED', 'PARTIAL')
        ORDER BY pick_date DESC, created_at DESC
        LIMIT 20
      `;
    }
  } catch (err) {
    error = err;
    console.error("Error en Prisma Direct Query:", err);
  }

  if (error || !data || data.length === 0) {
    return {
      yesterday: null, today: null, tomorrow: null, calendar: null,
      dates: { yesterdayStr, todayStr, tomorrowStr },
      debug_data: data, debug_error: error,
    };
  }

  const allBlocks: any[] = [];
  for (const row of data) {
    const rowDate = normalizeDateKey(row.pick_date);
    
    // Validamos el parseo de los objetos JSON por si vienen mapeados como string
    let jsonData = row.json_data;
    if (typeof jsonData === 'string') {
      try { jsonData = JSON.parse(jsonData); } catch(e) {}
    }
    
    let resultsData = row.results_data;
    if (typeof resultsData === 'string') {
      try { resultsData = JSON.parse(resultsData); } catch(e) {}
    }

    const blocks = mergeResultsIntoBlocks(jsonData || [], resultsData);

    for (const block of blocks) {
      const blockDate = normalizeDateKey(block.game_date) || rowDate;
      allBlocks.push({
        ...block,
        game_date: blockDate || block.game_date,
      });
    }
  }

  const isVisibleBlock = (b: any) => !b.matchup?.startsWith('🌎');

  const yesterday = allBlocks.filter(b => normalizeDateKey(b.game_date) === yesterdayStr && isVisibleBlock(b));
  const today = allBlocks.filter(b => normalizeDateKey(b.game_date) === todayStr && isVisibleBlock(b));
  const tomorrow = allBlocks.filter(b => normalizeDateKey(b.game_date) === tomorrowStr && isVisibleBlock(b));
  
  // ✅ Pestaña calendario para capturar los partidos de días subsiguientes
  const calendar = allBlocks.filter(b => {
    const d = normalizeDateKey(b.game_date);
    return d && d > tomorrowStr && isVisibleBlock(b);
  });

  return {
    yesterday: yesterday.length > 0 ? yesterday : null,
    today:     today.length     > 0 ? today     : null,
    tomorrow:  tomorrow.length  > 0 ? tomorrow  : null,
    calendar:  calendar.length  > 0 ? calendar  : null,
    dates: { yesterdayStr, todayStr, tomorrowStr },
    debug_data: data,
    debug_error: error,
  };
}

// ─── 1. EQUIPOS ───────────────────────────────────────────────────────────────

export async function getTeams() {
  try {
    return await prisma.teams.findMany({ orderBy: { name: 'asc' } });
  } catch (e) {
    console.error('Error en getTeams:', e);
    return [];
  }
}

// ─── 2. ROSTER DEL EQUIPO ────────────────────────────────────────────────────

export type TeamRosterPlayer = {
  id: number;
  full_name: string;
  team: string;
  team_abbreviation: string;
  injury_status?: InjuryRow['status'] | null;
  current_line?: number | null;
  current_prop?: string | null;
  hit_rate?: number | null;
};

export async function getTeamPlayersForTeams(
  teams: string[],
  options: { stat?: string; book?: string } = {}
): Promise<TeamRosterPlayer[]> {
  try {
    const cleanTeams = Array.from(new Set((teams || []).map(normalizeTeamAbbr).filter(Boolean)));
    if (cleanTeams.length === 0) return [];

    const activeStat = options.stat || 'pts';
    const propType = statToPropType(activeStat);
    const book = String(options.book || 'stake').toLowerCase();

    const candidates = await prisma.player_game_logs.findMany({
      where: { team_abbreviation: { in: cleanTeams, mode: 'insensitive' } },
      distinct: ['player_id'],
      select: { player_id: true },
    });

    const playerIds = candidates
      .map((c) => c.player_id)
      .filter((id): id is number => typeof id === 'number');

    if (playerIds.length === 0) return [];

    const recentLogs = await prisma.player_game_logs.findMany({
      where: { player_id: { in: playerIds } },
      orderBy: { game_date: 'desc' },
    });

    const logsByPlayer: Record<number, any[]> = {};
    for (const log of recentLogs) {
      if (typeof log.player_id !== 'number') continue;
      if (!logsByPlayer[log.player_id]) logsByPlayer[log.player_id] = [];
      if (logsByPlayer[log.player_id].length < 20) logsByPlayer[log.player_id].push(log);
    }

    const rosterBase: Array<{ id: number; full_name: string; team: string; team_abbreviation: string; logs: any[] }> = [];

    for (const [pIdStr, logs] of Object.entries(logsByPlayer)) {
      const recentFive = logs.slice(0, 5);
      const teamCounts: Record<string, number> = {};
      let trueTeam = '';
      let maxCount = 0;

      for (const log of recentFive) {
        const t = normalizeTeamAbbr(log.team_abbreviation);
        if (!t) continue;
        teamCounts[t] = (teamCounts[t] || 0) + 1;
        if (teamCounts[t] > maxCount) {
          maxCount = teamCounts[t];
          trueTeam = t;
        }
      }

      if (!cleanTeams.includes(trueTeam)) continue;

      rosterBase.push({
        id: parseInt(pIdStr, 10),
        full_name: logs[0]?.player_name || `Jugador ${pIdStr}`,
        team: trueTeam,
        team_abbreviation: trueTeam,
        logs,
      });
    }

    const normalizedNames = Array.from(
      new Set(rosterBase.map((p) => normalizePlayerName(p.full_name)).filter(Boolean))
    );

    const lineByPlayerNorm = new Map<string, number>();
    if (normalizedNames.length > 0) {
      try {
        const oddsRows = await prisma.$queryRaw<any[]>(Prisma.sql`
          SELECT DISTINCT ON (player_norm, stat_key, COALESCE(model_line, threshold))
            player_norm,
            stat_key,
            COALESCE(model_line, threshold) AS line,
            scraped_at_utc
          FROM public.latest_player_prop_odds
          WHERE lower(book) = ${book}
            AND stat_key = ${propType}
            AND player_norm IN (${Prisma.join(normalizedNames)})
          ORDER BY player_norm, stat_key, COALESCE(model_line, threshold), scraped_at_utc DESC
        `);

        for (const row of oddsRows || []) {
          const norm = normalizePlayerName(row.player_norm);
          const line = toNumber(row.line, NaN);
          if (!norm || !Number.isFinite(line)) continue;
          if (!lineByPlayerNorm.has(norm)) lineByPlayerNorm.set(norm, line);
        }
      } catch (err) {
        console.warn('No pude cargar líneas actuales para roster:', err);
      }
    }

    const injuries = await getInjuries();
    const injuryByNameTeam = new Map<string, InjuryRow>();
    for (const injury of injuries) {
      injuryByNameTeam.set(`${normalizePlayerName(injury.player_name)}|${normalizeTeamAbbr(injury.team_abbreviation)}`, injury);
    }

    const finalRoster: TeamRosterPlayer[] = rosterBase.map((p) => {
      const norm = normalizePlayerName(p.full_name);
      const line = lineByPlayerNorm.get(norm) ?? null;
      const last10 = p.logs.slice(0, 10);
      const hits = line === null ? null : last10.filter((log) => getLogStatValue(log, activeStat) >= line).length;
      const hitRate = line === null || last10.length === 0 || hits === null
        ? null
        : Math.round((hits / last10.length) * 100);
      const injury = injuryByNameTeam.get(`${norm}|${p.team_abbreviation}`);

      return {
        id: p.id,
        full_name: p.full_name,
        team: p.team,
        team_abbreviation: p.team_abbreviation,
        injury_status: injury?.status ?? null,
        current_line: line,
        current_prop: propType,
        hit_rate: hitRate,
      };
    });

    return finalRoster.sort((a, b) => {
      if (a.team_abbreviation !== b.team_abbreviation) return a.team_abbreviation.localeCompare(b.team_abbreviation);
      return a.full_name.localeCompare(b.full_name);
    });
  } catch (e: unknown) {
    console.error('Error en getTeamPlayersForTeams:', e);
    return [];
  }
}

export async function getTeamPlayers(teamAbbr: string, options: { stat?: string; book?: string } = {}) {
  return getTeamPlayersForTeams([teamAbbr], options);
}

// ─── 3. DETALLES DE JUGADOR ───────────────────────────────────────────────────

export async function getPlayerData(playerId: string) {
  try {
    const id = parseInt(playerId);
    if (isNaN(id)) return { player: null, stats: [] };

    let player = await prisma.players.findUnique({ where: { id } });

    const normalizeDate = (value: any) => {
      if (!value) return null;
      if (value instanceof Date) return value.toISOString();
      const raw = String(value);
      const match = raw.match(/^\d{4}-\d{2}-\d{2}/);
      if (match) return match[0];
      const d = new Date(raw);
      return Number.isNaN(d.getTime()) ? raw : d.toISOString();
    };

    const num = (value: any) => {
      if (value === null || value === undefined || value === '') return 0;
      const n = Number(value);
      return Number.isFinite(n) ? n : 0;
    };

    const cleanMin = (value: any) => {
      if (value === null || value === undefined || value === '') return null;
      if (typeof value === 'string' && value.includes(':')) {
        const [mRaw, sRaw = '0'] = value.split(':');
        const m = Number(mRaw);
        const s = Number(sRaw);
        if (!Number.isFinite(m)) return null;
        return Number((m + (Number.isFinite(s) ? s / 60 : 0)).toFixed(1));
      }
      const n = Number(String(value).replace('m', ''));
      return Number.isFinite(n) ? Number(n.toFixed(1)) : null;
    };

    const first = (...values: any[]) => values.find((v) => v !== null && v !== undefined && v !== '');

    const get = (row: any, ...keys: string[]) => {
      for (const k of keys) {
        if (row && row[k] !== undefined && row[k] !== null && row[k] !== '') return row[k];
        const upper = k.toUpperCase();
        if (row && row[upper] !== undefined && row[upper] !== null && row[upper] !== '') return row[upper];
      }
      return undefined;
    };

    const normalizeSplitPrefix = (row: any) => {
      const raw = String(
        get(row, 'split_code', 'split', 'period', 'period_code', 'scope', 'period_type') ?? ''
      ).toUpperCase();

      if (raw === 'Q1' || raw === '1' || raw === 'P1' || raw.includes('1Q')) return 'q1';
      if (raw === 'H1' || raw === 'FIRST_HALF' || raw === '1H' || raw.includes('FIRST')) return 'h1';
      if (raw === 'H2' || raw === 'H2_REG' || raw === 'SECOND_HALF' || raw === '2H' || raw.includes('SECOND')) return 'h2';
      return null;
    };

    const withStatAliases = (s: any) => {
      const row = {
        ...s,
        game_date: normalizeDate(s.game_date),

        // Full game aliases para que los componentes acepten variantes.
        pts: num(first(s.pts, s.points)),
        reb: num(first(s.reb, s.rebounds)),
        ast: num(first(s.ast, s.assists)),
        oreb: num(s.oreb),
        dreb: num(s.dreb),
        stl: num(s.stl),
        blk: num(s.blk),
        tov: num(s.tov ?? s.to),
        to: num(s.to ?? s.tov),
        pf: num(s.pf),
        fgm: num(s.fgm),
        fga: num(s.fga),
        fg3m: num(s.fg3m ?? s['3ptm'] ?? s['3pm']),
        fg3a: num(s.fg3a ?? s['3pta']),
        ftm: num(s.ftm),
        fta: num(s.fta),
        min: cleanMin(first(s.min_clean, s.min, s.minutes, s.minutes_played, s.min_sec)),
        minutes: cleanMin(first(s.min_clean, s.minutes, s.min, s.minutes_played, s.min_sec)),
        min_clean: cleanMin(first(s.min_clean, s.min, s.minutes, s.minutes_played, s.min_sec)),

        // Supporting data actual: vienen en public.player_game_logs / vista clean.
        usage_pct: num(s.usage_pct ?? s.usg_pct),
        potential_ast: num(s.potential_ast ?? s.potential_assists ?? s.ast_potential ?? s.pot_ast),
        rebound_chances: num(s.rebound_chances ?? s.reb_chances),
        touches: num(s.touches),
      } as any;

      row.fg_pct = num(s.fg_pct ?? (row.fga > 0 ? (row.fgm / row.fga) * 100 : 0));
      row.fg3_pct = num(s.fg3_pct ?? (row.fg3a > 0 ? (row.fg3m / row.fg3a) * 100 : 0));
      row.ft_pct = num(s.ft_pct ?? (row.fta > 0 ? (row.ftm / row.fta) * 100 : 0));
      row.game_result = s.game_result ?? s.wl ?? null;

      row.pr = num(s.pr ?? row.pts + row.reb);
      row.pa = num(s.pa ?? row.pts + row.ast);
      row.ra = num(s.ra ?? row.reb + row.ast);
      row.pra = num(s.pra ?? row.pts + row.reb + row.ast);
      row.pts_reb = row.pr;
      row.pts_ast = row.pa;
      row.reb_ast = row.ra;
      row.pts_reb_ast = row.pra;
      row['3ptm'] = row.fg3m;
      row['3pta'] = row.fg3a;
      row.stl_blk = row.stl + row.blk;

      for (const prefix of ['q1', 'h1', 'h2']) {
        row[`${prefix}_pts`] = num(s[`${prefix}_pts`]);
        row[`${prefix}_reb`] = num(s[`${prefix}_reb`]);
        row[`${prefix}_ast`] = num(s[`${prefix}_ast`]);
        row[`${prefix}_oreb`] = num(s[`${prefix}_oreb`]);
        row[`${prefix}_dreb`] = num(s[`${prefix}_dreb`]);
        row[`${prefix}_stl`] = num(s[`${prefix}_stl`]);
        row[`${prefix}_blk`] = num(s[`${prefix}_blk`]);
        row[`${prefix}_tov`] = num(s[`${prefix}_tov`] ?? s[`${prefix}_to`]);
        row[`${prefix}_to`] = num(s[`${prefix}_to`] ?? s[`${prefix}_tov`]);
        row[`${prefix}_pf`] = num(s[`${prefix}_pf`]);
        row[`${prefix}_fgm`] = num(s[`${prefix}_fgm`]);
        row[`${prefix}_fga`] = num(s[`${prefix}_fga`]);
        row[`${prefix}_fg3m`] = num(s[`${prefix}_fg3m`] ?? s[`${prefix}_3ptm`] ?? s[`${prefix}_3pm`]);
        row[`${prefix}_3ptm`] = row[`${prefix}_fg3m`];
        row[`${prefix}_fg3a`] = num(s[`${prefix}_fg3a`] ?? s[`${prefix}_3pta`]);
        row[`${prefix}_3pta`] = row[`${prefix}_fg3a`];
        row[`${prefix}_ftm`] = num(s[`${prefix}_ftm`]);
        row[`${prefix}_fta`] = num(s[`${prefix}_fta`]);

        row[`${prefix}_pr`] = num(s[`${prefix}_pr`] ?? s[`${prefix}_pts_reb`] ?? row[`${prefix}_pts`] + row[`${prefix}_reb`]);
        row[`${prefix}_pa`] = num(s[`${prefix}_pa`] ?? s[`${prefix}_pts_ast`] ?? row[`${prefix}_pts`] + row[`${prefix}_ast`]);
        row[`${prefix}_ra`] = num(s[`${prefix}_ra`] ?? s[`${prefix}_reb_ast`] ?? row[`${prefix}_reb`] + row[`${prefix}_ast`]);
        row[`${prefix}_pra`] = num(s[`${prefix}_pra`] ?? s[`${prefix}_pts_reb_ast`] ?? row[`${prefix}_pts`] + row[`${prefix}_reb`] + row[`${prefix}_ast`]);

        row[`${prefix}_pts_reb`] = row[`${prefix}_pr`];
        row[`${prefix}_pts_ast`] = row[`${prefix}_pa`];
        row[`${prefix}_reb_ast`] = row[`${prefix}_ra`];
        row[`${prefix}_pts_reb_ast`] = row[`${prefix}_pra`];
        row[`${prefix}_stl_blk`] = row[`${prefix}_stl`] + row[`${prefix}_blk`];
      }

      return row;
    };

    // ⚡ Fuente rápida para la player page.
    // Evitamos Supabase .from('v_ludo_player_game_logs_clean_periods_v2').select('*') porque esa vista
    // puede pegar statement_timeout al renderizar la página y también desde generateMetadata.
    const baseStats = await prisma.player_game_logs.findMany({
      where: { player_id: id },
      orderBy: { game_date: 'desc' },
      take: 120,
    });

    // Q1 / H1 / H2 se cargan aparte desde la vista liviana de splits.
    // Si esta parte falla, no rompe FULL game ni potenciales.
    const normalizeGameIdKey = (value: any) => {
      if (value === null || value === undefined || value === '') return '';
      const raw = String(value).trim();
      const digits = raw.replace(/\D/g, '');
      if (!digits) return raw;
      return digits.replace(/^0+/, '') || '0';
    };

    const splitByGame = new Map<string, any>();
    try {
      const splitRows = await prisma.$queryRawUnsafe<any[]>(
        `
        SELECT *
        FROM nba_api_data.v_player_period_splits_front_v2
        WHERE player_id::text = $1::text
        ORDER BY game_date DESC
        LIMIT 900
        `,
        String(id)
      );

      for (const split of splitRows || []) {
        const prefix = normalizeSplitPrefix(split);
        if (!prefix) continue;

        const rawGameId = String(get(split, 'game_id') ?? get(split, 'game_id_nozero') ?? '');
        const gameId = normalizeGameIdKey(rawGameId);
        if (!gameId) continue;

        const acc = splitByGame.get(gameId) || {};
        acc[`${prefix}_min`] = first(get(split, 'min'), get(split, 'minutes'), get(split, 'min_text'));
        acc[`${prefix}_minutes`] = acc[`${prefix}_min`];

        const fields = ['pts','reb','ast','oreb','dreb','stl','blk','tov','to','pf','fgm','fga','fg3m','fg3a','ftm','fta'];
        for (const f of fields) {
          acc[`${prefix}_${f}`] = num(get(split, f, f === 'tov' ? 'to' : f));
        }

        acc[`${prefix}_pr`] = num(get(split, 'pr', 'pts_reb') ?? acc[`${prefix}_pts`] + acc[`${prefix}_reb`]);
        acc[`${prefix}_pa`] = num(get(split, 'pa', 'pts_ast') ?? acc[`${prefix}_pts`] + acc[`${prefix}_ast`]);
        acc[`${prefix}_ra`] = num(get(split, 'ra', 'reb_ast') ?? acc[`${prefix}_reb`] + acc[`${prefix}_ast`]);
        acc[`${prefix}_pra`] = num(get(split, 'pra', 'pts_reb_ast') ?? acc[`${prefix}_pts`] + acc[`${prefix}_reb`] + acc[`${prefix}_ast`]);

        splitByGame.set(gameId, acc);
      }
    } catch (splitError) {
      console.warn('No se pudieron cargar splits Q1/H1/H2 para player page:', splitError);
    }

    let serializedStats = baseStats.map((s: any) => {
      const gameId = normalizeGameIdKey(s.game_id ?? get(s, 'game_id_nozero'));
      const splitPayload = gameId ? (splitByGame.get(gameId) || splitByGame.get(String(s.game_id ?? '')) || {}) : {};
      return withStatAliases({
        ...s,
        ...splitPayload,
        game_date: s.game_date ? s.game_date.toISOString?.() ?? s.game_date : null,
      });
    });

    if (!player && serializedStats.length > 0) {
      const fullName = serializedStats[0].player_name || 'Jugador';
      const nameParts = fullName.split(' ');
      player = {
        id,
        full_name: fullName,
        first_name: nameParts[0],
        last_name: nameParts.slice(1).join(' '),
        team_id: null,
        api_id: null,
        jersey_number: null,
        position: null,
        image_url: null,
      } as any;
    }

    return { player, stats: serializedStats };
  } catch (e) {
    console.error('Error en getPlayerData:', e);
    return { player: null, stats: [] };
  }
}

// ─── 4. TRENDING PLAYERS ─────────────────────────────────────────────────────

export async function getTrendingPlayers() {
  try {
    const playersWithLogs = await prisma.players.findMany({
      include: { player_game_logs: { orderBy: { game_date: 'desc' }, take: 5 } },
    });

    return playersWithLogs
      .map(player => {
        const logs = player.player_game_logs;
        if (logs.length === 0) return null;
        const avg_pts = (logs.reduce((s, l) => s + (l.pts || 0), 0) / logs.length).toFixed(1);
        return {
          id: player.id, first_name: player.first_name, last_name: player.last_name,
          team: logs[0].team_abbreviation, avg_pts: parseFloat(avg_pts),
        };
      })
      .filter(Boolean)
      .sort((a, b) => b!.avg_pts - a!.avg_pts)
      .slice(0, 4);
  } catch (e) {
    console.error('Error en getTrendingPlayers:', e);
    return [];
  }
}

// ─── 5. CEREBRO EV+ — STAKE ──────────────────────────────────────────────────

export async function getEvPlays() {
  try {
    return await getPicksForDates('ludo_picks');
  } catch (e) {
    console.error('Error en getEvPlays:', e);
    return {
      yesterday: null, today: null, tomorrow: null, calendar: null,
      dates: { yesterdayStr: '', todayStr: '', tomorrowStr: '' },
    };
  }
}

// ─── 6. CEREBRO EV+ — BETANO ─────────────────────────────────────────────────

export async function getBetanoPlays() {
  try {
    return await getPicksForDates('betano_picks');
  } catch (e) {
    console.error('Error en getBetanoPlays:', e);
    return {
      yesterday: null, today: null, tomorrow: null, calendar: null,
      dates: { yesterdayStr: '', todayStr: '', tomorrowStr: '' },
    };
  }
}

// ─── 7. RADAR SOCIAL ─────────────────────────────────────────────────────────

export async function getRedditTrends() {
  try {
    return await prisma.reddit_trends.findMany({
      orderBy: { hype_score: 'desc' }, take: 12,
    });
  } catch (e) {
    console.error('Error en getRedditTrends:', e);
    return [];
  }
}

// ─── 8. CARTELERA ESPN ───────────────────────────────────────────────────────

export async function getTodayScoreboard() {
  try {
    const res = await fetch(
      'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard',
      { next: { revalidate: 60 } }
    );
    const data = await res.json();
    return data.events || [];
  } catch (e) {
    console.error('Error cargando ESPN Scoreboard:', e);
    return [];
  }
}

// ─── 9. LESIONES ESPN ────────────────────────────────────────────────────────

export async function getNBAInjuries() {
  try {
    const res = await fetch(
      'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/injuries',
      { next: { revalidate: 300 } }
    );
    const data = await res.json();
    return data.teams || [];
  } catch (e) {
    console.error('Error cargando lesionados:', e);
    return [];
  }
}

// ─── 10. TOP PERFORMERS ──────────────────────────────────────────────────────

export async function getTopPerformers() {
  try {
    const teamsWithInjuries = await getNBAInjuries();
    const outPlayers = teamsWithInjuries.flatMap((t: any) =>
      t.injuries
        .filter((i: any) => i.status.toLowerCase().includes('out'))
        .map((i: any) => i.athlete.displayName)
    );

    const playersWithLogs = await prisma.players.findMany({
      include: { player_game_logs: { orderBy: { game_date: 'desc' }, take: 10 } },
    });

    const processedPlayers = playersWithLogs
      .filter(p => !outPlayers.includes(`${p.first_name} ${p.last_name}`))
      .map(p => {
        const logs = p.player_game_logs;
        const count = logs.length || 1;
        return {
          id: p.id,
          full_name: `${p.first_name} ${p.last_name}`,
          team_abbr: logs[0]?.team_abbreviation || 'NBA',
          pts_avg: logs.reduce((s, l) => s + (l.pts || 0), 0) / count,
          reb_avg: logs.reduce((s, l) => s + (l.reb || 0), 0) / count,
          ast_avg: logs.reduce((s, l) => s + (l.ast || 0), 0) / count,
        };
      });

    return {
      puntos:      [...processedPlayers].sort((a, b) => b.pts_avg - a.pts_avg).slice(0, 3),
      rebotes:     [...processedPlayers].sort((a, b) => b.reb_avg - a.reb_avg).slice(0, 3),
      asistencias: [...processedPlayers].sort((a, b) => b.ast_avg - a.ast_avg).slice(0, 3),
      pra:         [...processedPlayers]
                     .sort((a, b) => (b.pts_avg + b.reb_avg + b.ast_avg) - (a.pts_avg + a.reb_avg + a.ast_avg))
                     .slice(0, 3),
    };
  } catch (e) {
    console.error('Error en getTopPerformers:', e);
    return { puntos: [], rebotes: [], asistencias: [], pra: [] };
  }
}
// ─── SCHEDULE ─────────────────────────────────────────────────────────────────

export type GameSlot = {
  matchup:   string;
  home_team: string;
  away_team: string;
  teams:     string[];
  spread?:   number | null;
  total?:    number | null;
};

function parseTeamFromMatchup(matchup: string | null, side: 'home' | 'away'): string {
  if (!matchup) return '';
  const parts = matchup.replace(/ vs /i, ' @ ').split(' @ ');
  if (parts.length !== 2) return '';
  return (side === 'away' ? parts[0] : parts[1]).trim().toUpperCase();
}

export async function getSchedule(): Promise<GameSlot[]> {
  try {
    const rows = await prisma.game_odds.findMany({
      select:   { matchup: true, home_team: true, away_team: true, spread: true, total: true },
      distinct: ['matchup'],
      orderBy:  { matchup: 'asc' },
    });
    return rows.map((r) => {
      const home = r.home_team?.toUpperCase() || parseTeamFromMatchup(r.matchup, 'home');
      const away = r.away_team?.toUpperCase() || parseTeamFromMatchup(r.matchup, 'away');
      return { matchup: r.matchup ?? '', home_team: home, away_team: away, teams: [away, home].filter(Boolean), spread: r.spread ?? null, total: r.total ?? null };
    }).filter((g) => g.teams.length > 0);
  } catch (e) { console.error('Error en getSchedule:', e); return []; }
}

// ─── INJURIES ─────────────────────────────────────────────────────────────────

export type InjuryRow = {
  player_id?: string;
  player_name: string;
  team_name: string;
  team_abbreviation: string;
  team_logo?: string;
  status: 'OUT' | 'DOUBTFUL' | 'QUESTIONABLE' | 'PROBABLE';
  reason?: string;
  updated_at: string;
};

function normalizeInjuryStatus(raw: string): InjuryRow['status'] {
  const s = raw?.toLowerCase() ?? '';
  if (s.includes('out')) return 'OUT';
  if (s.includes('doubt')) return 'DOUBTFUL';
  if (s.includes('question')) return 'QUESTIONABLE';
  return 'PROBABLE';
}

export async function getInjuries(): Promise<InjuryRow[]> {
  try {
    const todayArg = formatArgDateKey(new Date());
    let rows = await prisma.nba_injuries.findMany({ where: { fetch_date: todayArg }, orderBy: [{ team_name: 'asc' }, { player_name: 'asc' }] });
    if (rows.length === 0) {
      const latest = await prisma.nba_injuries.findFirst({ orderBy: { created_at: 'desc' }, select: { fetch_date: true } });
      if (latest?.fetch_date) rows = await prisma.nba_injuries.findMany({ where: { fetch_date: latest.fetch_date }, orderBy: [{ team_name: 'asc' }, { player_name: 'asc' }] });
    }
    return rows.map((r: any) => ({
      player_id: r.player_id ?? undefined,
      player_name: r.player_name,
      team_name: r.team_name,
      team_abbreviation: normalizeTeamAbbr(r.team_abbreviation || r.team_id),
      team_logo: r.team_logo ?? undefined,
      status: normalizeInjuryStatus(r.status),
      reason: r.comment ?? undefined,
      updated_at: r.created_at.toISOString(),
    }));
  } catch (e) { console.error('Error en getInjuries:', e); return []; }
}

// ─── ACTIVE INJURY CONTEXT / W-O histórico ──────────────────────────────────

export type ActiveInjuryContextRow = {
  game_date: string | Date | null;
  matchup: string | null;
  player_id: number | string | null;
  target_player: string | null;
  team_abbreviation: string | null;
  team_name: string | null;
  absent_teammate: string | null;
  absent_status: string | null;
  absent_importance: string | null;
  absent_importance_score: number;
  sample_confidence: string | null;
  games: number;
  avg_min: number;
  avg_pts: number;
  avg_reb: number;
  avg_ast: number;
  avg_pra: number;
  avg_pr: number;
  avg_pa: number;
  avg_ra: number;
  avg_3pm: number;
  avg_usage_pct: number | null;
  avg_touches: number | null;
  avg_potential_ast: number | null;
  avg_rebound_chances: number | null;
  absent_avg_min: number | null;
  absent_avg_pra: number | null;
  absent_avg_usage_pct: number | null;
  first_game: string | Date | null;
  last_game: string | Date | null;
};

function nullableNumber(value: any): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export async function getPlayerActiveInjuryContext(
  playerId: number | string | null | undefined,
  gameDate: string | null | undefined,
): Promise<ActiveInjuryContextRow[]> {
  try {
    const numericPlayerId = Number(playerId);
    if (!Number.isFinite(numericPlayerId) || !gameDate) return [];

    const cleanGameDate = String(gameDate).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(cleanGameDate)) return [];

    const selectSql = `
      SELECT
        game_date,
        matchup,
        player_id,
        target_player,
        team_abbreviation,
        team_name,
        absent_teammate,
        absent_status,
        absent_importance,
        absent_importance_score,
        sample_confidence,
        games,
        avg_min,
        avg_pts,
        avg_reb,
        avg_ast,
        avg_pra,
        avg_pr,
        avg_pa,
        avg_ra,
        avg_3pm,
        avg_usage_pct,
        avg_touches,
        avg_potential_ast,
        avg_rebound_chances,
        absent_avg_min,
        absent_avg_pra,
        absent_avg_usage_pct,
        first_game,
        last_game
      FROM public.v_ludo_active_injury_context
    `;

    let rows = await prisma.$queryRawUnsafe<any[]>(
      `${selectSql}
       WHERE player_id = $1
         AND game_date = $2::date
       ORDER BY
         absent_importance_score DESC NULLS LAST,
         games DESC NULLS LAST,
         avg_pra DESC NULLS LAST`,
      numericPlayerId,
      cleanGameDate,
    );

    // Fallback defensivo: si la página llega con fecha corrida por timezone o con la fecha del día anterior,
    // usamos la fecha activa más cercana dentro de ±2 días. Esto evita que el panel quede vacío aunque la vista sí tenga datos.
    if (!rows.length) {
      rows = await prisma.$queryRawUnsafe<any[]>(
        `${selectSql}
         WHERE player_id = $1
           AND game_date BETWEEN ($2::date - INTERVAL '2 days') AND ($2::date + INTERVAL '2 days')
         ORDER BY
           ABS(game_date - $2::date) ASC,
           absent_importance_score DESC NULLS LAST,
           games DESC NULLS LAST,
           avg_pra DESC NULLS LAST`,
        numericPlayerId,
        cleanGameDate,
      );
    }

    return rows.map((row: any) => ({
      ...row,
      game_date: row.game_date?.toISOString?.().slice(0, 10) ?? row.game_date,
      first_game: row.first_game?.toISOString?.().slice(0, 10) ?? row.first_game,
      last_game: row.last_game?.toISOString?.().slice(0, 10) ?? row.last_game,
      player_id: toNumber(row.player_id, numericPlayerId),
      absent_importance_score: toNumber(row.absent_importance_score, 0),
      games: toNumber(row.games, 0),
      avg_min: toNumber(row.avg_min, 0),
      avg_pts: toNumber(row.avg_pts, 0),
      avg_reb: toNumber(row.avg_reb, 0),
      avg_ast: toNumber(row.avg_ast, 0),
      avg_pra: toNumber(row.avg_pra, 0),
      avg_pr: toNumber(row.avg_pr, 0),
      avg_pa: toNumber(row.avg_pa, 0),
      avg_ra: toNumber(row.avg_ra, 0),
      avg_3pm: toNumber(row.avg_3pm, 0),
      avg_usage_pct: nullableNumber(row.avg_usage_pct),
      avg_touches: nullableNumber(row.avg_touches),
      avg_potential_ast: nullableNumber(row.avg_potential_ast),
      avg_rebound_chances: nullableNumber(row.avg_rebound_chances),
      absent_avg_min: nullableNumber(row.absent_avg_min),
      absent_avg_pra: nullableNumber(row.absent_avg_pra),
      absent_avg_usage_pct: nullableNumber(row.absent_avg_usage_pct),
    }));
  } catch (error) {
    console.error('getPlayerActiveInjuryContext error:', error);
    return [];
  }
}
