import { redirect } from 'next/navigation';
import { requirePageUser } from '@/lib/auth/server';
import { validTicketDate } from '@/lib/ludoTickets';

export const dynamic = 'force-dynamic';
export default async function PreviousPicksPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePageUser();
  const params = await searchParams;
  const q = new URLSearchParams();
  if (typeof params.date === 'string' && validTicketDate(params.date)) q.set('date', params.date);
  if (typeof params.book === 'string' && ['stake','betano','bet365'].includes(params.book)) q.set('book', params.book);
  redirect('/tickets' + (q.size ? '?' + q.toString() : ''));
}
