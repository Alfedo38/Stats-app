"use client";

import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  LabelList,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

// ─── Helpers ───────────────────────────────────────────────────────────────────

function getStatDisplay(value: any, isPercentage?: boolean) {
  const n = Number(value) || 0;
  const formatted = Number.isInteger(n) ? String(n) : n.toFixed(1);
  return isPercentage ? `${formatted}%` : formatted;
}

function getMinutesValue(raw: any) {
  const value =
    raw?.min ?? raw?.minutes ?? raw?.mins ?? raw?.minutos ??
    raw?.minutes_played ?? raw?.mp ?? null;
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "string") {
    if (value.includes(":")) {
      const m = Number(value.split(":")[0]);
      return Number.isNaN(m) ? null : m;
    }
    const parsed = Number(value.replace("m", ""));
    return Number.isNaN(parsed) ? null : parsed;
  }
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function getMinutesLabel(raw: any) {
  const m = getMinutesValue(raw);
  if (m === null) return "S/D";
  return `${Math.round(m)}m`;
}

function getOpponent(item: any) {
  const parts = item?.matchup ? String(item.matchup).trim().split(" ") : [];
  return parts.length > 0 ? parts[parts.length - 1] : "---";
}

function getGameLocation(item: any) {
  return item?.matchup?.includes("@") ? "@" : "vs";
}

function formatRatio(actual: number, opportunity: number | null) {
  if (!opportunity || opportunity <= 0) return "S/D";
  return `${Math.round((actual / opportunity) * 100)}%`;
}

// ─── Custom Tooltip ───────────────────────────────────────────────────────────

const CustomTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const data = payload[0]?.payload;
  if (!data) return null;

  const dateObj   = new Date(data.game_date);
  const shortDate = dateObj.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const oppTeam   = getOpponent(data);
  const logoId    = oppTeam.toLowerCase();
  const actual    = Number(data.value) || 0;
  const display   = getStatDisplay(actual, data.is_percentage);
  const location  = getGameLocation(data);
  const isOver    = actual >= (data.lineValue ?? 0);
  const opportunity = data.__opportunity === null || data.__opportunity === undefined
    ? null : Number(data.__opportunity);

  // W/L badge
  const wl = data.game_result; // "W" | "L" | null — if available in your data

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] p-4 rounded-xl shadow-[0_10px_40px_rgba(0,0,0,0.8)] flex flex-col gap-3 min-w-[220px]">
      <div className="flex justify-between items-center border-b border-[var(--border)] pb-2">
        <span className="text-[var(--text-muted)] text-[9px] font-black uppercase tracking-widest">
          {shortDate}
        </span>
        <div className="flex items-center gap-2">
          {wl && (
            <span className={`text-[9px] font-black px-1.5 py-0.5 rounded border ${
              wl === "W"
                ? "text-[#10b981] border-[#10b981]/30 bg-[#10b981]/10"
                : "text-red-400 border-red-500/30 bg-red-500/10"
            }`}>
              {wl}
            </span>
          )}
          <span className={`text-[9px] font-black uppercase tracking-widest ${isOver ? "text-[#10b981]" : "text-red-400"}`}>
            {isOver ? "Over" : "Under"}
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <span className="text-[var(--text-muted)] text-xs font-bold italic uppercase">{location}</span>
          <img
            src={`https://a.espncdn.com/i/teamlogos/nba/500/scoreboard/${logoId}.png`}
            alt={oppTeam}
            className="w-7 h-7 object-contain drop-shadow-md"
            onError={(e) => { e.currentTarget.src = "https://a.espncdn.com/i/teamlogos/nba/500/scoreboard/nba.png"; }}
          />
          <span className="text-[var(--text)] font-black text-sm uppercase">{oppTeam}</span>
        </div>
        <span className={`font-black text-3xl tabular-nums leading-none ${isOver ? "text-[#10b981]" : "text-red-400"}`}>
          {display}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[var(--border)]">
        <div>
          <p className="text-[8px] text-[var(--text-muted)] uppercase font-black tracking-widest">Minutos</p>
          <p className="text-[var(--text)] text-sm font-black">{getMinutesLabel(data)}</p>
        </div>
        <div>
          <p className="text-[8px] text-[var(--text-muted)] uppercase font-black tracking-widest">Línea</p>
          <p className="text-[var(--text)] text-sm font-black tabular-nums">{data.lineValue ?? "-"}</p>
        </div>
        {opportunity !== null && Number.isFinite(opportunity) && opportunity > 0 && (
          <>
            <div>
              <p className="text-[8px] text-[var(--text-muted)] uppercase font-black tracking-widest">
                {data.__opportunityLabel ?? "Oportunidad"}
              </p>
              <p className="text-sm font-black tabular-nums" style={{ color: data.__opportunityColor ?? "#60a5fa" }}>
                {getStatDisplay(opportunity)}
              </p>
            </div>
            <div>
              <p className="text-[8px] text-[var(--text-muted)] uppercase font-black tracking-widest">
                {data.__ratioLabel ?? "Ratio"}
              </p>
              <p className="text-[var(--text)] text-sm font-black tabular-nums">
                {formatRatio(actual, opportunity)}
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

// ─── X Axis tick — date / rival / minutes / W-L ───────────────────────────────

const makeXAxisTick = (dataArray: any[]) => {
  const CustomXAxisTick = ({ x, y, index }: any) => {
    const item = dataArray[index];
    if (!item) return null;

    const dateObj   = new Date(item.game_date);
    const shortDate = `${dateObj.getMonth() + 1}/${dateObj.getDate()}`;
    const oppPrefix = getGameLocation(item);
    const oppTeam   = getOpponent(item);
    const wl        = item.game_result as string | undefined; // "W" | "L" if in data

    return (
      <g transform={`translate(${x},${y})`}>
        {/* Date */}
        <text x={0} y={16} textAnchor="middle" fill="#38bdf8" fontSize={13} fontWeight={900}>
          {shortDate}
        </text>

        {/* Opponent */}
        <text x={0} y={34} textAnchor="middle" fill="#d1d5db" fontSize={11} fontWeight={900} className="uppercase">
          {oppPrefix} {oppTeam}
        </text>

        {/* Minutes */}
        <text x={0} y={52} textAnchor="middle" fill="#10b981" fontSize={11} fontWeight={900} className="uppercase">
          {getMinutesLabel(item)}
        </text>

        {/* W/L — only rendered if game_result exists in your data */}
        {wl && (
          <text
            x={0}
            y={68}
            textAnchor="middle"
            fill={wl === "W" ? "#10b981" : "#f87171"}
            fontSize={10}
            fontWeight={900}
          >
            {wl}
          </text>
        )}
      </g>
    );
  };
  return CustomXAxisTick;
};

// ─── Bar value label ──────────────────────────────────────────────────────────

const ValueLabel = (props: any) => {
  const { x, y, width, height, value, payload } = props;
  const label  = getStatDisplay(value, payload?.is_percentage);
  const inside = height > 26;

  return (
    <text
      x={x + width / 2}
      y={inside ? y + 20 : y - 8}
      textAnchor="middle"
      fill={inside ? "#050505" : "#ffffff"}
      fontSize={13}
      fontWeight={950}
      className="tabular-nums"
      paintOrder="stroke"
      stroke={inside ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.85)"}
      strokeWidth={inside ? 0.5 : 2.5}
    >
      {label}
    </text>
  );
};

// ─── Overlay (opportunity) label ──────────────────────────────────────────────

const OpportunityLabel = (props: any) => {
  const { x, y, value, payload } = props;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  const color = payload?.__opportunityColor ?? "#60a5fa";
  return (
    <text
      x={x}
      y={y - 12}
      textAnchor="middle"
      fill={color}
      fontSize={10}
      fontWeight={950}
      className="tabular-nums"
      paintOrder="stroke"
      stroke="rgba(0,0,0,0.9)"
      strokeWidth={3}
    >
      {getStatDisplay(n)}
    </text>
  );
};

// ─── Floating stake line label ────────────────────────────────────────────────
// Recharts ReferenceLine label rendered as a custom SVG element

const StakeLineLabel = ({ viewBox, lineValue, isPercentage }: any) => {
  if (!viewBox) return null;
  const { x, y, width } = viewBox;
  const label = isPercentage ? `${lineValue}%` : String(lineValue);
  const px    = (x ?? 0) + (width ?? 0) - 4;

  return (
    <g>
      {/* Pill background */}
      <rect
        x={px - label.length * 5.5 - 8}
        y={y - 11}
        width={label.length * 5.5 + 16}
        height={18}
        rx={9}
        fill="#10b981"
      />
      <text
        x={px - label.length * 5.5 / 2}
        y={y + 3}
        textAnchor="middle"
        fill="#000"
        fontSize={10}
        fontWeight={900}
      >
        {label}
      </text>
    </g>
  );
};

// ─── Main component ───────────────────────────────────────────────────────────

export default function PlayerChart({
  data,
  statKey = "pts",
  lineValue = 24.5,
  overlayKey,
  overlayLabel,
  overlayColor = "#60a5fa",
  overlayRatioLabel = "Ratio",
}: {
  data: any[];
  statKey?: string;
  lineValue?: number;
  overlayKey?: string;
  overlayLabel?: string;
  overlayColor?: string;
  overlayRatioLabel?: string;
}) {
  if (!data || data.length === 0) {
    return (
      <div className="text-[var(--text-muted)] text-center flex flex-col items-center justify-center h-full gap-2">
        <span className="font-bold uppercase tracking-widest text-xs">Sin datos recientes</span>
      </div>
    );
  }

  const isPercentage = Boolean(data[0]?.is_percentage);

  const sortedData = [...data]
    .map((item) => ({ ...item, lineValue }))
    .sort((a, b) => new Date(a.game_date).getTime() - new Date(b.game_date).getTime());

  const hasOverlay = Boolean(
    overlayKey &&
    sortedData.some((item) => {
      const n = Number(item?.[overlayKey]);
      return Number.isFinite(n) && n > 0;
    })
  );

  const chartData = sortedData.map((item) => {
    const opportunity = hasOverlay && overlayKey ? Number(item?.[overlayKey]) : null;
    return {
      ...item,
      __opportunity:
        opportunity !== null && Number.isFinite(opportunity) && opportunity > 0
          ? opportunity
          : null,
      __opportunityLabel: overlayLabel,
      __opportunityColor: overlayColor,
      __ratioLabel: overlayRatioLabel,
    };
  });

  // Extra bottom margin if W/L data exists (adds a 4th row in x tick)
  const hasWL     = chartData.some((d) => d.game_result);
  const bottomMgn = hasWL ? 82 : 66;

  const XAxisTick = makeXAxisTick(chartData);

  return (
    <div className="w-full h-[430px] relative">
      {hasOverlay && (
        <div className="absolute left-3 top-1 z-10 flex items-center gap-2 rounded-full border border-[#1f2937] bg-[var(--bg)]/70 px-3 py-1.5 backdrop-blur-sm">
          <span
            className="w-2 h-2 rounded-full shadow-[0_0_10px_currentColor]"
            style={{ backgroundColor: overlayColor, color: overlayColor }}
          />
          <span className="text-[9px] text-[#9ca3af] font-black uppercase tracking-[0.18em]">
            {overlayLabel}
          </span>
        </div>
      )}

      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={chartData}
          margin={{ top: hasOverlay ? 46 : 34, right: 48, left: -20, bottom: bottomMgn }}
        >
          <defs>
            <linearGradient id="neonGreen" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor="#34d399" stopOpacity={1}    />
              <stop offset="100%" stopColor="#059669" stopOpacity={0.3}  />
            </linearGradient>
            <linearGradient id="neonRed" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor="#f87171" stopOpacity={1}    />
              <stop offset="100%" stopColor="#dc2626" stopOpacity={0.3}  />
            </linearGradient>
          </defs>

          <CartesianGrid vertical={false} stroke="#111" opacity={0.35} />

          <XAxis
            dataKey="game_date"
            tick={<XAxisTick />}
            axisLine={false}
            tickLine={false}
            interval={0}
          />

          <YAxis
            tick={{ fill: "#444", fontSize: 10, fontWeight: 900 }}
            axisLine={false}
            tickLine={false}
            dx={-10}
            tickFormatter={(v) => isPercentage ? `${v}%` : v}
          />

          <Tooltip
            content={<CustomTooltip />}
            cursor={{ fill: "#ffffff", opacity: 0.04 }}
          />

          {/* ── Stake line — white dashed + green floating label ───────────── */}
          <ReferenceLine
            y={lineValue}
            stroke="rgba(255,255,255,0.55)"
            strokeDasharray="6 4"
            strokeWidth={1.5}
            label={
              <StakeLineLabel
                lineValue={isPercentage ? `${lineValue}%` : lineValue}
                isPercentage={isPercentage}
              />
            }
          />

          {/* ── Bars — wider, more rounded ─────────────────────────────────── */}
          <Bar
            dataKey={statKey}
            radius={[8, 8, 0, 0]}
            maxBarSize={56}
            isAnimationActive={false}
          >
            <LabelList content={<ValueLabel />} />
            {chartData.map((entry, index) => {
              const val = Number(entry[statKey]) || 0;
              return (
                <Cell
                  key={`cell-${index}`}
                  fill={val >= lineValue ? "url(#neonGreen)" : "url(#neonRed)"}
                />
              );
            })}
          </Bar>

          {hasOverlay && (
            <Line
              type="monotone"
              dataKey="__opportunity"
              stroke={overlayColor}
              strokeWidth={2.5}
              strokeDasharray="5 5"
              dot={{ r: 4, fill: "#050505", stroke: overlayColor, strokeWidth: 2 }}
              activeDot={{ r: 6, fill: overlayColor, stroke: "#050505", strokeWidth: 2 }}
              connectNulls={false}
              isAnimationActive={false}
            >
              <LabelList content={<OpportunityLabel />} />
            </Line>
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
