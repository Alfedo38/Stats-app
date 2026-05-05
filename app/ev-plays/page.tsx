import { getEvPlays } from '@/lib/api';
import EVDashboard from '@/components/EVDashboard';

// Le decimos a Next.js que NO guarde en caché esta página. 
export const dynamic = 'force-dynamic';

// 👇 ESTA LÍNEA ES LA QUE FALLABA. Tiene que decir EXACTAMENTE "export default function"
export default async function EVPlaysPage() {
  const evPlays = await getEvPlays();

  // 🛡️ BLINDAJE: Pantalla de carga/espera si no hay datos
  if (!evPlays || evPlays.length === 0) {
    return (
      <main className="min-h-screen bg-black text-white p-4 md:p-8 flex flex-col items-center justify-center">
        <h1 className="text-3xl font-black italic uppercase tracking-tighter mb-4">
          <span className="text-[#10b981]">EV+</span>
        </h1>
        <div className="border border-[#10b981]/20 bg-[#10b981]/10 p-6 rounded-lg text-center max-w-md">
          <p className="text-[#10b981] font-bold animate-pulse">⚙️ Procesando modelos...</p>
          <p className="text-sm text-gray-400 mt-2">
            Nuestros algoritmos están analizando las líneas de apuestas actuales. 
            Vuelve a recargar la página en unos minutos.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black text-white p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-black italic uppercase tracking-tighter">
            <span className="text-[#10b981]">EV+</span>
          </h1>
          <p className="text-[#666] text-[10px] font-bold uppercase tracking-widest mt-1">
            Pronósticos matemáticos
          </p>
        </div>
        
        <EVDashboard plays={evPlays} />
      </div>
    </main>
  );
}