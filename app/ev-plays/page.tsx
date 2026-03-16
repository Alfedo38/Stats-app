import { getEvPlays } from '@/lib/api';
import EVDashboard from '@/components/EVDashboard';

export const dynamic = 'force-dynamic';

export default async function EVPlaysPage() {
  // Le pedimos a la base de datos las apuestas ganadoras de hoy
  const evPlays = await getEvPlays();

  return (
    <main className="min-h-screen bg-black text-white p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-black italic uppercase tracking-tighter">
            Cerebro <span className="text-[#10b981]">EV+</span>
          </h1>
          <p className="text-[#666] text-[10px] font-bold uppercase tracking-widest mt-1">
            Pronósticos matemáticos
          </p>
        </div>
        
        {/* Aquí llamamos al componente interactivo que vamos a crear en el Paso 2 */}
        <EVDashboard plays={evPlays} />
      </div>
    </main>
  );
}