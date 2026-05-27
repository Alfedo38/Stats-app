import { getEvPlays, getBetanoPlays } from '@/lib/api';
import EVDashboard from '@/components/EVDashboard';
import BookmakerSelector from '@/components/BookmakerSelector';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'EV+ Cerebro',
};

export default async function EVPlaysPage({
  searchParams,
}: {
  searchParams: Promise<{ book?: string }>;
}) {
  const params = await searchParams;
  const activeBook = params?.book === 'betano' ? 'betano' : 'stake';

  const picksData = activeBook === 'betano'
    ? await getBetanoPlays()
    : await getEvPlays();

  const { yesterday, today, tomorrow, calendar, dates } = picksData as any;
  const hasAnyData = yesterday || today || tomorrow || calendar;

  return (
    <main className="min-h-screen bg-[var(--bg)] text-[var(--text)] p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black italic uppercase tracking-tighter">
              <span className="text-[#10b981]">EV+</span>
            </h1>
            <p className="text-[var(--text-muted)] text-[10px] font-bold uppercase tracking-widest mt-1">
              Pronósticos matemáticos
            </p>
          </div>
          <BookmakerSelector activeBook={activeBook} />
        </div>

        {!hasAnyData ? (
          <div className="border border-[#10b981]/20 bg-[#10b981]/10 p-6 rounded-2xl text-center max-w-md mx-auto">
            <p className="text-[#10b981] font-bold animate-pulse">⚙️ Procesando modelos...</p>
            <p className="text-sm text-[var(--text-muted)] mt-2">
              Los algoritmos están analizando las líneas de{' '}
              {activeBook === 'betano' ? 'Betano' : 'Stake'}.
              Volvé en unos minutos.
            </p>
          </div>
        ) : (
          <EVDashboard
            yesterday={yesterday}
            today={today}
            tomorrow={tomorrow}
            dates={dates}
            bookmaker={activeBook}
          />
        )}

      </div>
    </main>
  );
}
