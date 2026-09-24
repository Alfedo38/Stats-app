"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Search, Shield, Users, X } from "lucide-react";
import { LEAGUE_TEAMS, isLeagueTeam } from "@/lib/teams";
import { getTeamColor } from "@/lib/teamColors";

const RECENT_KEY = "moskprops:recent-teams";

function readRecentTeams() {
  if (typeof window === "undefined") return [] as string[];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(RECENT_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.filter(isLeagueTeam).slice(0, 5) : [];
  } catch {
    return [];
  }
}

function rememberTeam(teamId: string) {
  if (typeof window === "undefined" || !isLeagueTeam(teamId)) return;
  const next = [teamId, ...readRecentTeams().filter((id) => id !== teamId)].slice(0, 5);
  window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
}

export default function QuickSwitcher() {
  const pathname = usePathname();
  const onPlayerPage = pathname.startsWith("/players/");
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [contextTeam, setContextTeam] = useState<string | null>(null);
  const [recent, setRecent] = useState<string[]>([]);

  useEffect(() => {
    const routeTeam = pathname.match(/^\/teams\/([^/]+)/)?.[1]?.toUpperCase();
    if (isLeagueTeam(routeTeam)) {
      setContextTeam(routeTeam!);
      rememberTeam(routeTeam!);
    }
    setRecent(readRecentTeams());
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    const updateContext = (event: Event) => {
      const team = String((event as CustomEvent)?.detail?.team || "").toUpperCase();
      if (!isLeagueTeam(team)) return;
      setContextTeam(team);
      rememberTeam(team);
      setRecent(readRecentTeams());
    };
    window.addEventListener("team-context-change", updateContext as EventListener);
    return () => window.removeEventListener("team-context-change", updateContext as EventListener);
  }, []);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", closeOnEscape);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.body.style.overflow = "";
    };
  }, [open]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return LEAGUE_TEAMS;
    return LEAGUE_TEAMS.filter((team) =>
      `${team.id} ${team.name}`.toLowerCase().includes(normalized),
    );
  }, [query]);

  const recentTeams = recent
    .map((id) => LEAGUE_TEAMS.find((team) => team.id === id))
    .filter(Boolean);
  const accent = getTeamColor(contextTeam);

  if (!onPlayerPage) return null;

  return (
    <>
      <div className="fixed bottom-4 left-4 z-[70] flex overflow-hidden rounded-full border border-[#10b981]/30 bg-[#07110e]/95 shadow-[0_12px_36px_rgba(0,0,0,0.55)] backdrop-blur md:left-[88px]">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex h-11 items-center gap-2 px-3 text-[9px] font-black uppercase tracking-widest text-white transition hover:bg-white/5"
          aria-haspopup="dialog"
          aria-expanded={open}
          title="Cambiar equipo"
        >
          <span
            className="grid h-7 min-w-7 place-items-center rounded-full border px-1.5 text-[9px]"
            style={{ color: accent, borderColor: `${accent}66`, background: `${accent}18` }}
          >
            {contextTeam || <Shield size={13} />}
          </span>
          <span className="hidden sm:inline">Equipos</span>
        </button>

        {onPlayerPage && (
          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent("open-player-roster"))}
            className="inline-flex h-11 items-center gap-2 border-l border-white/10 px-3 text-[9px] font-black uppercase tracking-widest text-white transition hover:bg-white/5 hover:text-[#10b981]"
            title="Cambiar jugador"
          >
            <Users size={14} className="text-[#10b981]" />
            <span className="hidden sm:inline">Jugadores</span>
          </button>
        )}
      </div>

      {open && (
        <div className="fixed inset-y-0 right-0 left-0 z-[260] md:left-[72px]" role="dialog" aria-modal="true" aria-label="Cambiar equipo">
          <button type="button" className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={() => setOpen(false)} aria-label="Cerrar selector" />
          <aside className="absolute inset-y-0 left-0 flex w-[min(100vw,430px)] flex-col border-r border-[#10b981]/25 bg-[var(--bg)] p-4 shadow-2xl">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[8px] font-black uppercase tracking-[0.24em] text-[#10b981]">Acceso rápido</p>
                <h2 className="text-xl font-black uppercase text-[var(--text)]">Cambiar equipo</h2>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="grid h-10 w-10 place-items-center rounded-xl border border-[var(--border)] text-[var(--text-muted)] hover:text-white" aria-label="Cerrar">
                <X size={18} />
              </button>
            </div>

            <label className="mt-4 flex h-11 items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 focus-within:border-[#10b981]/50">
              <Search size={15} className="text-[var(--text-muted)]" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar equipo..." autoFocus className="min-w-0 flex-1 bg-transparent text-sm font-bold text-[var(--text)] outline-none placeholder:text-[var(--text-muted)]" />
              {query && <button type="button" onClick={() => setQuery("")} className="text-[var(--text-muted)]" aria-label="Limpiar búsqueda"><X size={14} /></button>}
            </label>

            {!query && recentTeams.length > 0 && (
              <div className="mt-4">
                <p className="mb-2 text-[8px] font-black uppercase tracking-widest text-[var(--text-muted)]">Recientes</p>
                <div className="flex flex-wrap gap-2">
                  {recentTeams.map((team) => team && (
                    <Link key={team.id} href={`/teams/${team.id}`} onClick={() => { rememberTeam(team.id); setOpen(false); }} className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[10px] font-black text-[var(--text)] hover:border-[#10b981]/40">
                      {team.id}
                    </Link>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-4 grid min-h-0 flex-1 grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3">
              {filtered.map((team) => {
                const color = getTeamColor(team.id);
                return (
                  <Link key={team.id} href={`/teams/${team.id}`} onClick={() => { rememberTeam(team.id); setOpen(false); }} className="group flex min-h-20 flex-col justify-between rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3 transition hover:-translate-y-0.5" style={{ borderColor: contextTeam === team.id ? `${color}88` : undefined }}>
                    <span className="text-lg font-black" style={{ color }}>{team.id}</span>
                    <span className="text-[9px] font-bold leading-tight text-[var(--text-muted)] group-hover:text-[var(--text)]">{team.name}</span>
                  </Link>
                );
              })}
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
