import prisma from './prisma';
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
    // ✅ CORRECCIÓN MODO DIOS: Traemos los datos directo con Prisma saltándonos Supabase JS
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

export async function getTeamPlayers(teamAbbr: string) {
  try {
    if (!teamAbbr) return [];
    const cleanAbbr = teamAbbr.trim().toUpperCase();

    const candidates = await prisma.player_game_logs.findMany({
      where: { team_abbreviation: { equals: cleanAbbr, mode: 'insensitive' } },
      distinct: ['player_id'],
      select: { player_id: true },
    });

    const playerIds = candidates.map(c => c.player_id);
    if (playerIds.length === 0) return [];

    const recentLogs = await prisma.player_game_logs.findMany({
      where: { player_id: { in: playerIds } },
      orderBy: { game_date: 'desc' },
    });

    const logsByPlayer: Record<number, any[]> = {};
    for (const log of recentLogs) {
      if (!logsByPlayer[log.player_id]) logsByPlayer[log.player_id] = [];
      if (logsByPlayer[log.player_id].length < 5) {
        logsByPlayer[log.player_id].push(log);
      }
    }

    const finalRoster = [];
    for (const [pIdStr, logs] of Object.entries(logsByPlayer)) {
      const teamCounts: Record<string, number> = {};
      let trueTeam = '';
      let maxCount = 0;
      for (const log of logs) {
        const t = log.team_abbreviation?.toUpperCase();
        if (!t) continue;
        teamCounts[t] = (teamCounts[t] || 0) + 1;
        if (teamCounts[t] > maxCount) { maxCount = teamCounts[t]; trueTeam = t; }
      }
      if (trueTeam === cleanAbbr) {
        finalRoster.push({ id: parseInt(pIdStr), full_name: logs[0].player_name, team: trueTeam });
      }
    }

    return finalRoster.sort((a, b) => a.full_name.localeCompare(b.full_name));
  } catch (e) {
    console.error('Error en getTeamPlayers:', e);
    return [];
  }
}

// ─── 3. DETALLES DE JUGADOR ───────────────────────────────────────────────────

export async function getPlayerData(playerId: string) {
  try {
    const id = parseInt(playerId);
    if (isNaN(id)) return { player: null, stats: [] };

    let player = await prisma.players.findUnique({ where: { id } });

    // ✅ Nueva fuente para el gráfico del jugador:
    // Esta vista ya trae partido completo + Q1 + H1 + H2_REG en la misma fila.
    // El componente espera columnas tipo q1_pts, h1_pts, h2_pts, etc.
    const { data: periodStats, error: periodError } = await supabase
      .from('v_ludo_player_game_logs_clean_periods_v2')
      .select('*')
      .eq('player_id', id)
      .order('game_date', { ascending: false });

    if (periodError) {
      console.error('Error leyendo v_ludo_player_game_logs_clean_periods_v2:', periodError);
    }

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

    const withStatAliases = (s: any) => {
      const row = {
        ...s,
        game_date: normalizeDate(s.game_date),

        // Full game aliases para que los componentes acepten variantes.
        pts: num(s.pts),
        reb: num(s.reb),
        ast: num(s.ast),
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
      } as any;

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

    let serializedStats = Array.isArray(periodStats)
      ? periodStats.map(withStatAliases)
      : [];

    // Fallback seguro: si por algún motivo la vista nueva no devuelve filas,
    // mantenemos el comportamiento viejo con Prisma para no romper la página.
    if (serializedStats.length === 0) {
      const stats = await prisma.player_game_logs.findMany({
        where: { player_id: id },
        orderBy: { game_date: 'desc' },
      });

      serializedStats = stats.map((s: any) => withStatAliases({
        ...s,
        game_date: s.game_date ? s.game_date.toISOString() : null,
      }));
    }

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