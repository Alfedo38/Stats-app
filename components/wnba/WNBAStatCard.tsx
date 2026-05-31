import type { ReactNode } from "react";

export default function WNBAStatCard({
  label,
  value,
  icon,
  hint,
  tone = "emerald",
}: {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  hint?: ReactNode;
  tone?: "emerald" | "red" | "blue" | "violet" | "gold";
}) {
  const toneClass = {
    emerald: "text-[#10b981] bg-[#10b981]/10 border-[#10b981]/20",
    red: "text-red-300 bg-red-500/10 border-red-400/20",
    blue: "text-sky-300 bg-sky-500/10 border-sky-400/20",
    violet: "text-violet-300 bg-violet-500/10 border-violet-400/20",
    gold: "text-amber-300 bg-amber-500/10 border-amber-400/20",
  }[tone];

  return (
    <div className="group relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-xl transition-all hover:-translate-y-0.5 hover:border-[#10b981]/35">
      <div className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-[#10b981]/5 blur-2xl transition-opacity group-hover:opacity-100" />
      <div className="relative flex items-start justify-between gap-4">
        <div>
          <p className="text-[9px] font-black uppercase tracking-[0.24em] text-[var(--text-muted)]">
            {label}
          </p>
          <div className="mt-1 text-3xl font-black tracking-tighter text-[var(--text)] tabular-nums">
            {value}
          </div>
          {hint && <div className="mt-1 text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">{hint}</div>}
        </div>
        {icon && <div className={`rounded-2xl border p-3 ${toneClass}`}>{icon}</div>}
      </div>
    </div>
  );
}
