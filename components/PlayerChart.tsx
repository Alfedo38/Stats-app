"use client";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, Cell } from 'recharts';

// 1. TOOLTIP PREMIUM PERSONALIZADO (El original que andaba perfecto)
const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    const rawDate = data.date || data.game_date || 'Game Date';
    return (
      <div className="bg-[#0a0a0a] border border-[#222] p-4 rounded-xl shadow-[0_10px_40px_rgba(0,0,0,0.8)] flex flex-col gap-2 min-w-[120px]">
        <div className="flex justify-between items-center border-b border-[#222] pb-2">
          <span className="text-[#888] text-[9px] font-black uppercase tracking-widest">{rawDate}</span>
          <span className="text-[#10b981] text-[9px] font-black uppercase tracking-widest">Final</span>
        </div>
        <div className="flex items-center justify-between gap-4 mt-1">
          <div className="flex items-center gap-2">
            <span className="text-[#666] text-xs font-bold italic">vs</span>
            <img 
              src={`https://a.espncdn.com/i/teamlogos/nba/500/scoreboard/${data.opp.toLowerCase()}.png`} 
              alt={data.opp} 
              className="w-7 h-7 object-contain drop-shadow-md" 
            />
            <span className="text-white font-black text-sm">{data.opp}</span>
          </div>
          <span className="text-white font-black text-2xl tabular-nums">{payload[0].value}</span>
        </div>
      </div>
    );
  }
  return null;
};

// 2. EL EJE X DE DOS LÍNEAS (Fecha Celeste / Rival Gris)
const CustomXAxisTick = ({ x, y, index, dataArray }: any) => {
  const item = dataArray[index];
  if (!item) return null;

  // Convertimos "2026-03-10" a "3/10"
  const rawDate = item.date || item.game_date || "";
  const dateParts = rawDate.split("-");
  const shortDate = dateParts.length >= 3 ? `${parseInt(dateParts[1])}/${parseInt(dateParts[2])}` : rawDate;

  // Agregamos @ si es visitante, vs si es local
  let oppPrefix = 'vs';
  if (item.matchup && item.matchup.includes('@')) {
    oppPrefix = '@';
  } else if (item.home_away && item.home_away === 'away') {
    oppPrefix = '@';
  }

  return (
    <g transform={`translate(${x},${y})`}>
      <text x={0} y={15} textAnchor="middle" fill="#38bdf8" fontSize={11} fontWeight={900}>
        {shortDate}
      </text>
      <text x={0} y={30} textAnchor="middle" fill="#888" fontSize={10} fontWeight={900} className="uppercase">
        {oppPrefix} {item.opp}
      </text>
    </g>
  );
};

export default function PlayerChart({ data, statKey = "pts", lineValue = 24.5 }: { data: any[], statKey?: string, lineValue?: number }) {
  if (!data || data.length === 0) return <div className="text-[#666] text-center py-10 font-bold uppercase tracking-widest text-xs">Sin datos para mostrar</div>;

  return (
    <div className="w-full h-[350px]">
      <ResponsiveContainer width="100%" height="100%">
        {/* Le damos un poco más de margen abajo (bottom: 25) para que entren las dos líneas de texto */}
        <BarChart data={data} margin={{ top: 20, right: 0, left: -20, bottom: 25 }}>
          
          <defs>
            <linearGradient id="neonGreen" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#34d399" stopOpacity={1}/>
              <stop offset="100%" stopColor="#059669" stopOpacity={0.3}/>
            </linearGradient>
            <linearGradient id="neonRed" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f87171" stopOpacity={1}/>
              <stop offset="100%" stopColor="#dc2626" stopOpacity={0.3}/>
            </linearGradient>
          </defs>

          {/* LA CORRECCIÓN ESTÁ AQUÍ: Usamos dataKey="date" en lugar de game_date */}
          <XAxis 
            dataKey="date" 
            tick={<CustomXAxisTick dataArray={data} />} 
            axisLine={false} 
            tickLine={false} 
            interval={0} 
          />
          <YAxis 
            tick={{ fill: '#444', fontSize: 10, fontWeight: 900 }} 
            axisLine={false} 
            tickLine={false} 
            dx={-10}
          />
          
          <Tooltip content={<CustomTooltip />} cursor={{ fill: '#111', opacity: 0.4 }} />
          
          <ReferenceLine y={lineValue} stroke="#ef4444" strokeDasharray="3 3" strokeWidth={2} opacity={0.8} />

          <Bar dataKey={statKey} radius={[6, 6, 0, 0]} maxBarSize={40}>
            {data.map((entry, index) => (
              <Cell 
                key={`cell-${index}`} 
                fill={entry[statKey] >= lineValue ? "url(#neonGreen)" : "url(#neonRed)"} 
                className="transition-all duration-300 hover:opacity-80"
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}