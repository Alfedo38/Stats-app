// app/api/injuries/sync/route.ts
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const ARG_TZ = 'America/Argentina/Buenos_Aires';

function getTodayArg(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: ARG_TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const y = parts.find(p => p.type === 'year')?.value;
  const m = parts.find(p => p.type === 'month')?.value;
  const d = parts.find(p => p.type === 'day')?.value;
  return `${y}-${m}-${d}`;
}

export async function GET(req: Request) {
  try {
    const todayStr = getTodayArg();
    const url = new URL(req.url);
    const force = url.searchParams.get("force") === "1";

    // Si ya hay datos de hoy, no volvemos a llamar a ESPN
    const existing = await prisma.nba_injuries.findFirst({ where: { fetch_date: todayStr } });
    if (existing && !force) {
      const count = await prisma.nba_injuries.count({ where: { fetch_date: todayStr } });
      return NextResponse.json({ success: true, cached: true, count, date: todayStr });
    }

    if (force) {
      await prisma.nba_injuries.deleteMany({ where: { fetch_date: todayStr } });
    }

    // Fetch ESPN
    const res = await fetch(
      'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/injuries',
      { cache: 'no-store' }
    );
    const data = await res.json();
    const teams: any[] = data.teams || [];

    // Borrar datos de más de 30 días para no inflar la tabla
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    await prisma.nba_injuries.deleteMany({ where: { created_at: { lt: cutoff } } });

    // Guardar las lesiones de hoy
    const rows = teams.flatMap((team: any) =>
      (team.injuries || []).map((injury: any) => ({
        fetch_date:  todayStr,
        team_id:     String(team.id),
        team_abbreviation: String(team.abbreviation || team.shortDisplayName || '').toUpperCase(),
        team_name:   team.displayName,
        team_logo:   team.logo,
        player_id:   String(injury.athlete?.id || ''),
        player_name: injury.athlete?.displayName || injury.athlete?.shortName || '',
        status:      injury.status || '',
        comment:     injury.comment || null,
      }))
    );

    if (rows.length > 0) {
      await prisma.nba_injuries.createMany({ data: rows, skipDuplicates: true });
    }

    return NextResponse.json({ success: true, cached: false, count: rows.length, date: todayStr });

  } catch (error: any) {
    console.error('Error en /api/injuries/sync:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}