import { withAuth, privateJson } from '@/lib/auth/server';
import { getTickets, validTicketDate, argentinaToday } from '@/lib/ludoTickets';

export const dynamic = 'force-dynamic';
export const GET = withAuth(async (request) => {
  const q = request.nextUrl.searchParams;
  const date = q.get('date') || argentinaToday();
  const book = q.get('book') || undefined;
  if (!validTicketDate(date) || (book && !['stake','betano','bet365'].includes(book))) {
    return privateJson({ error: 'Fecha o casa inválida.' }, 400);
  }
  try {
    return privateJson({ date, tickets: await getTickets(date, book, q.get('history') === '1') });
  } catch {
    return privateJson({ error: 'Tickets no disponibles. Revisá la instalación y la sincronización.' }, 503);
  }
});
