"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Clock3, ChevronRight } from "lucide-react";
import { getTeamColor } from "@/lib/teamColors";

type RecentPlayer = {
  id: string;
  name: string;
  team: string;
  viewedAt: number;
};

const KEY = "moskprops:recent-players";

export default function RecentPlayers() {
  const [players, setPlayers] = useState<RecentPlayer[]>([]);

  useEffect(() => {
    try {
      const parsed = JSON.parse(window.localStorage.getItem(KEY) || "[]");
      if (Array.isArray(parsed)) setPlayers(parsed.slice(0, 5));
    } catch {
      setPlayers([]);
    }
  }, []);

  if (!players.length) return null;

  return (
    <section className="space-y-3">
      <h3 className="flex items-center gap-2 px-1 text-[9px] font-black uppercase tracking-[0.3em] text-[var(--text-muted)]">
        <Clock3 size={13} className="text-[#10b981]" /> Consultados recientemente
      </h3>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
        {players.map((player) => {
          const color = getTeamColor(player.team);
          return (
            <Link key={player.id} href={`/players/${player.id}`} className="group flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3 hover:border-[var(--border-strong)]">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border text-[9px] font-black" style={{ color, borderColor: `${color}55`, background: `${color}12` }}>{player.team || "—"}</span>
              <span className="min-w-0 flex-1 truncate text-[10px] font-black uppercase text-[var(--text)]">{player.name}</span>
              <ChevronRight size={13} className="text-[var(--text-muted)] transition group-hover:translate-x-0.5 group-hover:text-[#10b981]" />
            </Link>
          );
        })}
      </div>
    </section>
  );
}
