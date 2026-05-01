import { getEvPlays } from '@/lib/api';
import EVDashboard from '@/components/EVDashboard';

// Le decimos a Next.js que NO guarde en caché esta página. 
// Queremos que siempre lea el JSON más reciente.
export const dynamic = 'force-dynamic';

export default async function EVPlaysPage() {
  // Le pedimos a la API que vaya a leer el archivo picks_hoy.json
  const evPlays = await getEvPlays();

  return (
    <main className="min-h-screen bg-black text-white p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* Cabecera / Título */}
        <div>
          <h1 className="text-3xl font-black italic uppercase tracking-tighter">
            Cerebro <span className="text-[#10b981]">EV+</span>
          </h1>
          <p className="text-[#666] text-[10px] font-bold uppercase tracking-widest mt-1">
            Pronósticos matemáticos de Ludogallina
          </p>
        </div>
        
        {/* Llamamos al panel visual pasándole los bloques de tickets */}
        <EVDashboard plays={evPlays} />
        
      </div>
    </main>
  );
}