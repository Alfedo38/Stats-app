import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

function toDateOnly(value: any): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const s = String(value);
  const m = s.match(/^\d{4}-\d{2}-\d{2}/);
  return m ? m[0] : s;
}

function makeJsonSafe(value: any): any {
  if (typeof value === 'bigint') {
    const n = Number(value);
    return Number.isSafeInteger(n) ? n : value.toString();
  }
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(makeJsonSafe);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, makeJsonSafe(v)]));
  }
  return value;
}

function normalizeBlocks(raw: any): any[] {
  if (!raw) return [];

  let parsed = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return [];
    }
  }

  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed?.blocks)) return parsed.blocks;
  if (Array.isArray(parsed?.data)) return parsed.data;
  if (Array.isArray(parsed?.tickets)) return [parsed];
  return [];
}

async function findStakePick(preferFuture: boolean) {
  const whereDate = preferFuture
    ? prisma.$queryRaw<any[]>`
        SELECT id, pick_date, status, run_id, json_data, created_at
        FROM public.ludo_picks
        WHERE pick_date >= CURRENT_DATE
          AND UPPER(COALESCE(status::text, 'ACTIVE')) = 'ACTIVE'
        ORDER BY pick_date ASC, created_at DESC
        LIMIT 1
      `
    : prisma.$queryRaw<any[]>`
        SELECT id, pick_date, status, run_id, json_data, created_at
        FROM public.ludo_picks
        WHERE UPPER(COALESCE(status::text, 'ACTIVE')) = 'ACTIVE'
        ORDER BY pick_date DESC, created_at DESC
        LIMIT 1
      `;

  const rows = await whereDate;
  return rows?.[0] ?? null;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const book = String(searchParams.get('book') || 'stake').toLowerCase();

    // Por ahora este fallback robusto aplica a Stake/ludo_picks.
    // Betano puede seguir usando su loader histórico sin romper la página.
    if (book === 'betano') {
      return NextResponse.json({
        ok: true,
        book,
        pick_date: null,
        blocks: [],
        message: 'No hay fallback Betano en esta ruta.',
      });
    }

    let row = await findStakePick(true);
    let mode = 'next-active';

    if (!row) {
      row = await findStakePick(false);
      mode = 'latest-active';
    }

    if (!row) {
      return NextResponse.json({
        ok: true,
        book,
        pick_date: null,
        blocks: [],
        message: 'No hay picks ACTIVE guardados en ludo_picks.',
      });
    }

    const blocks = normalizeBlocks(row.json_data)
      .filter((b) => b && !String(b?.matchup || '').startsWith('🌎'));

    const pickDate = toDateOnly(row.pick_date);
    const message = mode === 'next-active'
      ? `Mostrando próxima fecha disponible: ${pickDate}`
      : `Mostrando último pick activo disponible: ${pickDate}`;

    return NextResponse.json(makeJsonSafe({
      ok: true,
      book,
      mode,
      id: row.id,
      pick_date: pickDate,
      status: row.status,
      run_id: row.run_id,
      created_at: row.created_at,
      blocks,
      count: blocks.length,
      message,
    }));
  } catch (error: any) {
    console.error('GET /api/ev-next-picks error:', error);
    return NextResponse.json(
      {
        ok: false,
        pick_date: null,
        blocks: [],
        error: error?.message || 'Error leyendo próxima fecha de EV picks',
      },
      { status: 200 }
    );
  }
}
