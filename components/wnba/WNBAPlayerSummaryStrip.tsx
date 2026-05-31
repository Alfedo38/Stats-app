import type { ReactNode } from "react";
import { Activity, GitMerge, Target, Zap } from "lucide-react";
import type { WNBAPlayerRow, WNBAPreparedLog } from "./types";
import { average, fmt, pct, signed } from "./utils";

export default function WNBAPlayerSummaryStrip({ profile, logs }: { profile: WNBAPlayerRow | null; logs: WNBAPreparedLog[] }) {
  const l5 = logs.slice(0, 5);
  const minAvg = profile?.min != null ? Number(profile.min) : average(l5, (x) => x.minutes_value);
  const praL5 = average(l5, (x) => x.pra);
  const plusMinusL5 = average(l5, (x) => x.plus_minus);

  return (
    <section className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
      <Metric icon={<Zap size={18} />} label="Usage Rate" value={pct(profile?.usg_pct)} tone="emerald" />
      <Metric icon={<GitMerge size={18} />} label="True Shooting" value={pct(profile?.ts_pct)} tone="sky" />
      <Metric icon={<Target size={18} />} label="Minutos" value={fmt(minAvg)} tone="violet" />
      <Metric icon={<Activity size={18} />} label="PRA L5" value={fmt(praL5)} hint={`+/- ${signed(plusMinusL5)}`} tone="gold" />
    </section>
  );
}

function Metric({ icon, label, value, hint, tone }: { icon: ReactNode; label: string; value: string; hint?: string; tone: "emerald" | "sky" | "violet" | "gold" }) {
  const color = {
    emerald: "text-[#10b981] bg-[#10b981]/10 border-[#10b981]/25",
    sky: "text-sky-300 bg-sky-500/10 border-sky-400/25",
    violet: "text-violet-300 bg-violet-500/10 border-violet-400/25",
    gold: "text-amber-300 bg-amber-500/10 border-amber-400/25",
  }[tone];

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-xl">
      <div className="flex items-center gap-3">
        <div className={`rounded-2xl border p-3 ${color}`}>{icon}</div>
        <div>
          <p className="text-[9px] font-black uppercase tracking-[0.22em] text-[var(--text-muted)]">{label}</p>
          <p className="text-2xl font-black italic tracking-tighter text-[var(--text)] tabular-nums">{value}</p>
          {hint && <p className="text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)]">{hint}</p>}
        </div>
      </div>
    </div>
  );
}
