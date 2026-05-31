import type { ReactNode } from "react";

export default function WNBASectionHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div>
        {eyebrow && (
          <p className="text-[10px] font-black uppercase tracking-[0.32em] text-[#10b981]">
            {eyebrow}
          </p>
        )}
        <h2 className="mt-1 text-2xl md:text-3xl font-black italic uppercase tracking-tighter text-[var(--text)]">
          {title}
        </h2>
        {description && (
          <p className="mt-2 max-w-2xl text-xs md:text-sm font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">
            {description}
          </p>
        )}
      </div>
      {action}
    </div>
  );
}
