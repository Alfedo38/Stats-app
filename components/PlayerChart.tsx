"use client";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, Cell } from 'recharts';

const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;

    const dateObj = new Date(data.game_date);
    const formattedDate = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    const matchupParts = data.matchup ? data.matchup.split(' ') : [];
    const oppTeam = matchupParts.length > 0 ? matchupParts[matchupParts.length - 1] : 'NBA';
    const logoId = oppTeam.toLowerCase();

    const displayValue = data.is_percentage ? `${payload[0].value}%` : payload[0].value;

    return (
      <div className="bg-[#0a0a0a] border border-[#222] p-4 rounded-xl shadow-[0_10px_40px_rgba(0,0,0,0.8)] flex flex-col gap-2 min-w-[140px]">
        <div className="flex justify-between items-center border-b border-[#222] pb-2">
          <span className="text-[#888] text-[9px] font-black uppercase tracking-widest">{formattedDate}</span>
          <span className="text-[#10b981] text-[9px] font-black uppercase tracking-widest">Final</span>
        </div>
        <div className="flex items-center justify-between gap-4 mt-1">
          <div className="flex items-center gap-2">
            <span className="text-[#666] text-xs font-bold italic">vs</span>
            <img
              src={`https://a.espncdn.com/i/teamlogos/nba/500/scoreboard/${logoId}.png`}
              alt={oppTeam}
              className="w-7 h-7 object-contain drop-shadow-md"
              onError={(e) => { e.currentTarget.src = 'https://a.espncdn.com/i/teamlogos/nba/500/scoreboard/nba.png'; }}
            />
            <span className="text-white font-black text-sm uppercase">{oppTeam}</span>
          </div>
          <span className="text-white font-black text-2xl tabular-nums">{displayValue}</span>
        </div>
      </div>
    );
  }
  return null;
};

// ✅ FIX: El tick ya no recibe dataArray como prop de JSX element.
// Recharts no reenvía props custom a los ticks cuando se pasa como JSX element (<CustomXAxisTick />).
// La solución es usar una render function que recibe los props de Recharts
// y le inyecta dataArray desde el closure del componente padre.
const makeXAxisTick = (dataArray: any[]) => {
  const CustomXAxisTick = ({ x, y, index }: any) => {
    const item = dataArray[index];
    if (!item) return null;

    const dateObj = new Date(item.game_date);
    const shortDate = `${dateObj.getMonth() + 1}/${dateObj.getDate()}`;
    const isAway = item.matchup?.includes('@');
    const oppPrefix = isAway ? '@' : 'vs';
    const matchupParts = item.matchup ? item.matchup.split(' ') : [];
    const oppTeam = matchupParts.length > 0 ? matchupParts[matchupParts.length - 1] : '---';

    return (
      <g transform={`translate(${x},${y})`}>
        <text x={0} y={15} textAnchor="middle" fill="#38bdf8" fontSize={11} fontWeight={900}>
          {shortDate}
        </text>
        <text x={0} y={30} textAnchor="middle" fill="#555" fontSize={9} fontWeight={900} className="uppercase">
          {oppPrefix} {oppTeam}
        </text>
      </g>
    );
  };

  return CustomXAxisTick;
};

export default function PlayerChart({
  data,
  statKey = "pts",
  lineValue = 24.5
}: {
  data: any[];
  statKey?: string;
  lineValue?: number;
}) {
  if (!data || data.length === 0) return (
    <div className="text-[#666] text-center flex flex-col items-center justify-center h-full gap-2">
      <span className="font-bold uppercase tracking-widest text-xs">Sin datos recientes</span>
    </div>
  );

  const sortedData = [...data].sort(
    (a, b) => new Date(a.game_date).getTime() - new Date(b.game_date).getTime()
  );

  // ✅ FIX: Generamos el componente tick con dataArray en el closure
  // En vez de pasar dataArray como prop (que Recharts ignoraba),
  // lo capturamos directamente desde el scope del render
  const XAxisTick = makeXAxisTick(sortedData);

  return (
    <div className="w-full h-[350px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={sortedData} margin={{ top: 20, right: 0, left: -20, bottom: 25 }}>

          <defs>
            <linearGradient id="neonGreen" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#34d399" stopOpacity={1} />
              <stop offset="100%" stopColor="#059669" stopOpacity={0.3} />
            </linearGradient>
            <linearGradient id="neonRed" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f87171" stopOpacity={1} />
              <stop offset="100%" stopColor="#dc2626" stopOpacity={0.3} />
            </linearGradient>
          </defs>

          <XAxis
            dataKey="game_date"
            tick={<XAxisTick />}
            axisLine={false}
            tickLine={false}
            interval={0}
          />
          <YAxis
            tick={{ fill: '#444', fontSize: 10, fontWeight: 900 }}
            axisLine={false}
            tickLine={false}
            dx={-10}
            tickFormatter={(value) => sortedData[0]?.is_percentage ? `${value}%` : value}
          />

          <Tooltip content={<CustomTooltip />} cursor={{ fill: '#ffffff', opacity: 0.05 }} />

          <ReferenceLine
            y={lineValue}
            stroke="#ef4444"
            strokeDasharray="5 5"
            strokeWidth={2}
            opacity={0.6}
          />

          <Bar dataKey={statKey} radius={[4, 4, 0, 0]} maxBarSize={35}>
            {sortedData.map((entry, index) => {
              const val = Number(entry[statKey]) || 0;
              return (
                <Cell
                  key={`cell-${index}`}
                  fill={val >= lineValue ? "url(#neonGreen)" : "url(#neonRed)"}
                />
              );
            })}
          </Bar>

        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}