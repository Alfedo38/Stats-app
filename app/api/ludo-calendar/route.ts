export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

const STATUS_PRIORITY: Record<string, number> = {
  SETTLED: 3, PARTIAL: 2, PENDING: 1,
};

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const book  = searchParams.get('book') === 'betano' ? 'betano_picks' : 'ludo_picks';

    const { data, error } = await supabase
      .from(book)
      .select('pick_date, status')
      .in('status', ['PENDING', 'SETTLED', 'PARTIAL'])
      .not('pick_date', 'is', null)
      .order('pick_date', { ascending: false });

    if (error || !data) return NextResponse.json([]);

    // Deduplicar por fecha — status más relevante gana
    const datesMap: Record<string, string> = {};
    for (const row of data) {
      const existing = datesMap[row.pick_date];
      if (!existing || (STATUS_PRIORITY[row.status] || 0) > (STATUS_PRIORITY[existing] || 0)) {
        datesMap[row.pick_date] = row.status;
      }
    }

    const result = Object.entries(datesMap)
      .map(([date, status]) => ({ date, status }))
      .sort((a, b) => b.date.localeCompare(a.date));

    return NextResponse.json(result);
  } catch (e) {
    console.error('LUDO_CALENDAR_API_ERROR:', e);
    return NextResponse.json([]);
  }
}