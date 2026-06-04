// app/injuries/page.tsx
import { PrismaClient } from '@prisma/client';
import { ChevronLeft, RefreshCw, CalendarDays } from 'lucide-react';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Injury Report | MoskProps',
};

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ['error', 'warn'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

type InjuryRow = {
  id: string | number | bigint;
  source: string | null;
  snapshot_key: string | null;
  report_ts: Date | string | null;
  game_date: Date | string | null;
  game_time_et: string | null;
  matchup: string | null;
  team: string | null;
  player_name_raw: string | null;
  player_name: string | null;
  current_status: string | null;
  normalized_status: string | null;
  severity: number | null;
  reason: string | null;
};

type TeamGroup = {
  id: string;
  displayName: string;
  logo: string;
  injuries: {
    id: string;
    athlete: { shortName: string };
    status: string;
    normalizedStatus: string;
    severity: number;
    comment: string | null;
    matchup: string | null;
    gameDate: Date | string | null;
    gameTimeEt: string | null;
  }[];
};

const TEAM_NAMES: Record<string, string> = {
  ATL: 'Atlanta Hawks',
  BOS: 'Boston Celtics',
  BKN: 'Brooklyn Nets',
  CHA: 'Charlotte Hornets',
  CHI: 'Chicago Bulls',
  CLE: 'Cleveland Cavaliers',
  DAL: 'Dallas Mavericks',
  DEN: 'Denver Nuggets',
  DET: 'Detroit Pistons',
  GSW: 'Golden State Warriors',
  HOU: 'Houston Rockets',
  IND: 'Indiana Pacers',
  LAC: 'LA Clippers',
  LAL: 'Los Angeles Lakers',
  MEM: 'Memphis Grizzlies',
  MIA: 'Miami Heat',
  MIL: 'Milwaukee Bucks',
  MIN: 'Minnesota Timberwolves',
  NOP: 'New Orleans Pelicans',
  NYK: 'New York Knicks',
  OKC: 'Oklahoma City Thunder',
  ORL: 'Orlando Magic',
  PHI: 'Philadelphia 76ers',
  PHX: 'Phoenix Suns',
  POR: 'Portland Trail Blazers',
  SAC: 'Sacramento Kings',
  SAS: 'San Antonio Spurs',
  TOR: 'Toronto Raptors',
  UTA: 'Utah Jazz',
  WAS: 'Washington Wizards',
};

const FULL_TEAM_NAME_TO_CODE: Record<string, string> = Object.fromEntries(
  Object.entries(TEAM_NAMES).map(([code, name]) => [name.toUpperCase(), code])
);

const ESPN_LOGO_CODES: Record<string, string> = {
  ATL: 'atl',
  BOS: 'bos',
  BKN: 'bkn',
  CHA: 'cha',
  CHI: 'chi',
  CLE: 'cle',
  DAL: 'dal',
  DEN: 'den',
  DET: 'det',
  GSW: 'gs',
  HOU: 'hou',
  IND: 'ind',
  LAC: 'lac',
  LAL: 'lal',
  MEM: 'mem',
  MIA: 'mia',
  MIL: 'mil',
  MIN: 'min',
  NOP: 'no',
  NYK: 'ny',
  OKC: 'okc',
  ORL: 'orl',
  PHI: 'phi',
  PHX: 'phx',
  POR: 'por',
  SAC: 'sac',
  SAS: 'sa',
  TOR: 'tor',
  UTA: 'utah',
  WAS: 'wsh',
};

const STATUS_COLUMNS = [
  { key: 'PROBABLE', label: 'Probable', headerClass: 'text-green-400 bg-green-500/5 border-green-500/20' },
  { key: 'QUESTIONABLE', label: 'Questionable', headerClass: 'text-yellow-300 bg-yellow-500/5 border-yellow-500/20' },
  { key: 'DOUBTFUL', label: 'Doubtful', headerClass: 'text-orange-400 bg-orange-500/5 border-orange-500/20' },
  { key: 'OUT', label: 'OUT', headerClass: 'text-red-400 bg-red-500/5 border-red-500/20' },
];

function cleanTeamCode(team: string | null | undefined): string {
  const raw = String(team || 'UNK').trim();
  if (!raw) return 'UNK';
  const upper = raw.toUpperCase();
  if (FULL_TEAM_NAME_TO_CODE[upper]) return FULL_TEAM_NAME_TO_CODE[upper];
  if (TEAM_NAMES[upper]) return upper;
  return upper;
}

function getTeamName(team: string | null | undefined): string {
  const code = cleanTeamCode(team);
  return TEAM_NAMES[code] || String(team || code || 'Unknown Team');
}

function getTeamLogo(team: string | null | undefined): string {
  const code = cleanTeamCode(team);
  const espnCode = ESPN_LOGO_CODES[code];
  if (!espnCode) return 'https://a.espncdn.com/i/teamlogos/leagues/500/nba.png';
  return `https://a.espncdn.com/i/teamlogos/nba/500/scoreboard/${espnCode}.png`;
}

function normalizeStatusForUi(status: string | null, fallback: string | null): string {
  const value = String(status || fallback || 'UNKNOWN').trim().toUpperCase();
  if (value.includes('OUT')) return 'OUT';
  if (value.includes('DOUBTFUL')) return 'DOUBTFUL';
  if (value.includes('QUESTIONABLE')) return 'QUESTIONABLE';
  if (value.includes('PROBABLE')) return 'PROBABLE';
  if (value.includes('AVAILABLE')) return 'AVAILABLE';
  return value || 'UNKNOWN';
}

function ymdFromDate(date: Date): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(date);
}

function isYmd(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days, 12, 0, 0));
  return date.toISOString().slice(0, 10);
}

function formatDateOnly(value: Date | string | null | undefined): string {
  if (!value) return 'Sin fecha';
  const raw = String(value);
  const ymd = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (ymd) return `${ymd[3]}/${ymd[2]}`;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return raw;
  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'America/Argentina/Buenos_Aires',
  }).format(date);
}

function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return 'Sin reporte cargado';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('es-AR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Argentina/Buenos_Aires',
  }).format(date);
}

async function getGameScopedInjuriesFromDB(baseDate: string) {
  const nextDate = addDaysYmd(baseDate, 1);

  const rows = await prisma.$queryRaw<InjuryRow[]>`
    WITH scoped AS (
      SELECT
        id,
        source,
        snapshot_key,
        report_ts,
        game_date,
        game_time_et,
        matchup,
        team,
        player_name_raw,
        player_name,
        current_status,
        normalized_status,
        severity,
        reason,
        ROW_NUMBER() OVER (
          PARTITION BY
            UPPER(COALESCE(team, '')),
            LOWER(COALESCE(player_name, player_name_raw, '')),
            UPPER(COALESCE(normalized_status, current_status, ''))
          ORDER BY
            report_ts DESC NULLS LAST,
            severity DESC NULLS LAST,
            id DESC
        ) AS rn
      FROM public.v_nba_injuries_latest
      WHERE game_date::date BETWEEN ${baseDate}::date AND ${nextDate}::date
        AND UPPER(COALESCE(normalized_status, current_status, '')) NOT LIKE '%AVAILABLE%'
        AND UPPER(COALESCE(normalized_status, current_status, '')) NOT LIKE '%ACTIVE%'
        AND UPPER(COALESCE(normalized_status, current_status, '')) <> 'UNKNOWN'
    )
    SELECT
      id,
      source,
      snapshot_key,
      report_ts,
      game_date,
      game_time_et,
      matchup,
      team,
      player_name_raw,
      player_name,
      current_status,
      normalized_status,
      severity,
      reason
    FROM scoped
    WHERE rn = 1
    ORDER BY
      game_date ASC NULLS LAST,
      team ASC NULLS LAST,
      severity DESC NULLS LAST,
      player_name ASC NULLS LAST
  `;

  const snapshot = rows[0]
    ? {
        source: rows[0].source || 'NBA_INJURIES',
        snapshotKey: rows[0].snapshot_key,
        reportTs: rows[0].report_ts,
      }
    : null;

  const teamsMap = new Map<string, TeamGroup>();

  for (const row of rows) {
    const teamCode = cleanTeamCode(row.team);
    const normalizedStatus = normalizeStatusForUi(row.normalized_status, row.current_status);

    if (!STATUS_COLUMNS.some((col) => col.key === normalizedStatus)) continue;

    if (!teamsMap.has(teamCode)) {
      teamsMap.set(teamCode, {
        id: teamCode,
        displayName: getTeamName(teamCode),
        logo: getTeamLogo(teamCode),
        injuries: [],
      });
    }

    teamsMap.get(teamCode)!.injuries.push({
      id: String(row.id),
      athlete: { shortName: row.player_name || row.player_name_raw || 'Sin nombre' },
      status: row.current_status || normalizedStatus,
      normalizedStatus,
      severity: Number(row.severity || 0),
      comment: row.reason,
      matchup: row.matchup,
      gameDate: row.game_date,
      gameTimeEt: row.game_time_et,
    });
  }

  return {
    snapshot,
    teams: Array.from(teamsMap.values()).sort((a, b) => a.displayName.localeCompare(b.displayName)),
    count: rows.length,
    baseDate,
    nextDate,
  };
}

function StatusPill({ injury }: { injury: TeamGroup['injuries'][number] }) {
  return (
    <div className="group/item relative rounded-xl border border-white/5 bg-black/35 px-3 py-2 hover:border-emerald-400/30 transition-all">
      <div className="text-[11px] font-black text-white leading-tight">
        {injury.athlete.shortName}
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-1 text-[8px] font-black uppercase tracking-widest text-slate-500">
        {injury.matchup && <span>{injury.matchup}</span>}
        {injury.gameDate && <span>{formatDateOnly(injury.gameDate)}</span>}
        {injury.gameTimeEt && <span>{injury.gameTimeEt} ET</span>}
      </div>

      <div className="absolute bottom-full left-1/2 z-50 mb-2 hidden w-64 -translate-x-1/2 rounded-xl border border-emerald-400/20 bg-black p-3 text-center text-[10px] leading-relaxed text-white shadow-2xl group-hover/item:block">
        <p className="mb-1 font-black uppercase text-red-400">{injury.status}</p>
        <p className="text-slate-300">{injury.comment || 'Sin detalle adicional'}</p>
      </div>
    </div>
  );
}

export default async function InjuriesPage({
  searchParams,
}: {
  searchParams?: Promise<{ date?: string }> | { date?: string };
}) {
  const resolvedSearchParams = await searchParams;
  const requestedDate = resolvedSearchParams?.date;
  const baseDate = isYmd(requestedDate) ? requestedDate : ymdFromDate(new Date());
  const { snapshot, teams, count, nextDate } = await getGameScopedInjuriesFromDB(baseDate);

  return (
    <main className="min-h-screen bg-[var(--bg)] text-[var(--text)] p-4 md:p-8 pb-20">
      <div className="mx-auto max-w-7xl space-y-7">
        <div className="flex flex-col gap-4 border-b border-[var(--border)] pb-6 md:flex-row md:items-end md:justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-[var(--text-muted)] hover:text-emerald-400 transition-colors">
              <ChevronLeft size={24} />
            </Link>

            <div>
              <h1 className="flex items-center gap-3 text-3xl font-black italic uppercase tracking-tighter">
                Injury <span className="text-red-500">Report</span> 🚑
              </h1>
              <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
                Solo equipos con partido {formatDateOnly(baseDate)} / {formatDateOnly(nextDate)} · Filas: {count}
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-2 md:items-end">
            <span className="w-fit rounded-md border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-[9px] font-black uppercase text-emerald-400">
              Game scoped snapshot
            </span>
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
              <RefreshCw size={12} />
              <span>{snapshot ? formatDateTime(snapshot.reportTs) : 'Sin reporte para esas fechas'}</span>
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-emerald-500/15 bg-emerald-500/[0.03] p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-emerald-300">
              <CalendarDays size={14} />
              Ventana activa
            </div>
            <div className="flex flex-wrap gap-2 text-[10px] font-black uppercase tracking-widest">
              <span className="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-1 text-emerald-300">
                {baseDate}
              </span>
              <span className="rounded-full border border-cyan-400/25 bg-cyan-400/10 px-3 py-1 text-cyan-300">
                {nextDate}
              </span>
              <Link
                href={`/injuries?date=${addDaysYmd(baseDate, -1)}`}
                className="rounded-full border border-white/10 px-3 py-1 text-slate-400 hover:border-emerald-400/30 hover:text-emerald-300"
              >
                Día anterior
              </Link>
              <Link
                href={`/injuries?date=${addDaysYmd(baseDate, 1)}`}
                className="rounded-full border border-white/10 px-3 py-1 text-slate-400 hover:border-emerald-400/30 hover:text-emerald-300"
              >
                Día siguiente
              </Link>
            </div>
          </div>
        </div>

        {teams.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-[var(--border)] py-20 text-center">
            <p className="text-sm font-black uppercase tracking-widest text-[var(--text-muted)]">
              Sin injury report para equipos con partido en esa ventana
            </p>
            <p className="mt-2 max-w-md text-[10px] font-bold uppercase tracking-widest text-[var(--text-soft)]">
              La página ahora filtra solo lesiones asociadas a partidos de hoy o mañana. Si esperabas datos, revisá game_date en public.v_nba_injuries_latest.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-[var(--border)] bg-[var(--surface-soft)]">
                    <th className="w-72 p-5 text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">
                      Equipo / partido
                    </th>
                    {STATUS_COLUMNS.map((col) => (
                      <th
                        key={col.key}
                        className={`border-x p-4 text-center text-[10px] font-black uppercase tracking-widest ${col.headerClass}`}
                      >
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {teams.map((team) => {
                    const firstGame = team.injuries[0];
                    return (
                      <tr key={team.id} className="group border-b border-[var(--border)] transition-colors hover:bg-[var(--surface-hover)]">
                        <td className="border-r border-[var(--border)] bg-[var(--surface)] p-5 align-top">
                          <div className="flex items-center gap-3">
                            <img src={team.logo} className="h-8 w-8 object-contain drop-shadow-lg" alt={team.displayName} />
                            <div className="flex flex-col">
                              <span className="text-xs font-black uppercase tracking-tighter transition-colors group-hover:text-emerald-400">
                                {team.displayName}
                              </span>
                              <span className="text-[9px] font-bold uppercase tracking-widest text-[var(--text-soft)]">
                                {team.id}
                              </span>
                              {firstGame?.matchup && (
                                <span className="mt-1 text-[9px] font-black uppercase tracking-widest text-cyan-300">
                                  {firstGame.matchup} · {formatDateOnly(firstGame.gameDate)}
                                </span>
                              )}
                            </div>
                          </div>
                        </td>

                        {STATUS_COLUMNS.map((col) => {
                          const playersInCol = team.injuries.filter((injury) => injury.normalizedStatus === col.key);
                          return (
                            <td key={col.key} className="border-r border-[var(--border)] p-3 align-top text-center last:border-0">
                              <div className="flex flex-col gap-2">
                                {playersInCol.length === 0 ? (
                                  <span className="text-[10px] text-[var(--text-soft)]">—</span>
                                ) : (
                                  playersInCol.map((injury) => <StatusPill key={`${team.id}-${injury.id}`} injury={injury} />)
                                )}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
