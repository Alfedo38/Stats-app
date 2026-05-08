export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

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
          resultado: result === 'WIN' ? true : result === 'LOSS' ? false : null,
        };
      }),
    })),
  }));
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date');
    const book = searchParams.get('book') === 'betano' ? 'betano_picks' : 'ludo_picks';

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json(null, { status: 400 });
    }

    const { data, error } = await supabase
      .from(book)
      .select('json_data, results_data, status, pick_date')
      .eq('pick_date', date)
      .in('status', ['PENDING', 'SETTLED', 'PARTIAL'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) return NextResponse.json(null);

    const blocks = mergeResultsIntoBlocks(data.json_data || [], data.results_data);
    return NextResponse.json({ blocks, status: data.status, pick_date: data.pick_date });
  } catch (e) {
    console.error('LUDO_PICKS_API_ERROR:', e);
    return NextResponse.json(null, { status: 500 });
  }
}