import { withAuth, privateJson } from '@/lib/auth/server';
import { getTickets, validTicketDate, getDefaultTicketDate, ticketFailureCode } from '@/lib/ludoTickets';

export const dynamic = 'force-dynamic';
export const GET = withAuth(async (request) => {
  const q = request.nextUrl.searchParams;
  const requested = q.get('date');
  const book = q.get('book') || undefined;
  if ((requested && !validTicketDate(requested)) || (book && !['stake','betano','bet365'].includes(book))) {
    return privateJson({ error: 'Fecha o casa inválida.' }, 400);
  }
  try {
    const date = requested || await getDefaultTicketDate();
    return privateJson({ date, tickets: await getTickets(date, book, q.get('history') === '1') });
  } catch (error) {
    return privateJson({ error: 'Tickets no disponibles en este momento.', code: ticketFailureCode(error) }, 503);
  }
});
