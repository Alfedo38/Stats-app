import Link from "next/link";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { addDays, qs } from "./utils";

export default function WNBADateTabs({ selectedDate, today }: { selectedDate: string; today: string }) {
  const prevDate = addDays(selectedDate, -1);
  const nextDate = addDays(selectedDate, 1);

  return (
    <section className="mb-6 flex flex-col gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3 shadow-xl md:flex-row md:items-center md:justify-between">
      <div className="flex flex-wrap items-center gap-2">
        <Link href={qs({ date: prevDate })} className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] px-4 py-2 text-xs font-black uppercase tracking-widest transition hover:border-[#10b981]/45">
          <ChevronLeft size={14} /> Ayer
        </Link>
        <Link href={qs({ date: today })} className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-xs font-black uppercase tracking-widest transition ${selectedDate === today ? "border-[#10b981] bg-[#10b981] text-black" : "border-[var(--border)] bg-[var(--surface-soft)] hover:border-[#10b981]/45"}`}>
          <CalendarDays size={14} /> Hoy
        </Link>
        <Link href={qs({ date: nextDate })} className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] px-4 py-2 text-xs font-black uppercase tracking-widest transition hover:border-[#10b981]/45">
          Mañana <ChevronRight size={14} />
        </Link>
      </div>

      <form className="flex w-full gap-2 md:w-auto">
        <input
          type="date"
          name="date"
          defaultValue={selectedDate}
          className="min-w-0 flex-1 rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] px-4 py-2 text-xs font-black outline-none focus:border-[#10b981]/70 md:w-[170px]"
        />
        <button className="rounded-xl bg-[#10b981] px-4 py-2 text-xs font-black uppercase tracking-widest text-black transition hover:opacity-90">
          Ver
        </button>
      </form>
    </section>
  );
}
