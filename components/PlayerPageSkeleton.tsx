// ─────────────────────────────────────────────────────────────────────────────
// components/PlayerPageSkeleton.tsx  —  VERSIÓN FINAL
//
// Skeleton animado que refleja EXACTAMENTE el layout actual:
//   PlayerHeader (ancho completo)
//   SocialRadar (row de pills)
//   xl: [sidebar 270px] + [columna principal]
//     Columna principal: StatNav, Controls, Chart, KpiCards,
//                        PickInsight, SupportingData, GameLog, DvP
// ─────────────────────────────────────────────────────────────────────────────

function Pulse({ className = "" }: { className?: string }) {
  return (
    <div
      className={`bg-[var(--surface-soft)] rounded-lg animate-pulse ${className}`}
      aria-hidden="true"
    />
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const P = Pulse;

// ─── Secciones individuales ───────────────────────────────────────────────────

function HeaderSkeleton() {
  return (
    <div className="relative overflow-hidden rounded-[2rem] border border-[var(--border)] bg-[var(--surface)] shadow-2xl p-6 md:p-8">
      {/* Strip izquierdo */}
      <P className="absolute left-0 top-0 bottom-0 w-1 rounded-l-[2rem]" />

      <div className="flex items-start gap-4 mb-5">
        {/* Avatar */}
        <P className="w-14 h-14 md:w-16 md:h-16 rounded-2xl shrink-0" />

        <div className="flex-1 space-y-2">
          <P className="h-2 w-36" />
          <P className="h-8 w-52 rounded-xl" />
          <P className="h-8 w-44 rounded-xl" />
          <div className="flex gap-2 pt-1">
            <P className="h-5 w-12 rounded-full" />
            <P className="h-5 w-10 rounded-full" />
          </div>
        </div>

        {/* Next game badge */}
        <P className="hidden md:block h-16 w-28 rounded-xl shrink-0" />
      </div>

      {/* KPI bar */}
      <div className="mt-5 pt-4 border-t border-[var(--border)]/40 grid grid-cols-2 sm:grid-cols-4 gap-4 pb-1">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="space-y-2">
            <P className="h-2 w-16" />
            <P className="h-7 w-14 rounded-xl" />
            <P className="h-2 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}

function SocialRadarSkeleton() {
  return (
    <div className="flex gap-2 px-1 flex-wrap">
      {[80, 64, 72].map((w, i) => (
        <P key={i} className={`h-6 rounded-full`} style={{ width: w }} />
      ))}
    </div>
  );
}

function SidebarSkeleton() {
  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[2rem] overflow-hidden shadow-2xl">
      <div className="p-4 border-b border-[var(--border)] space-y-3">
        <div className="flex items-center justify-between">
          <div className="space-y-1.5">
            <P className="h-2 w-10" />
            <P className="h-6 w-20 rounded-xl" />
          </div>
          <P className="h-6 w-10 rounded-full" />
        </div>
        {/* Game selector */}
        <P className="h-10 w-full rounded-xl" />
        {/* Search */}
        <P className="h-10 w-full rounded-xl" />
      </div>
      <div className="p-2 space-y-1">
        {[...Array(9)].map((_, i) => (
          <div key={i} className="flex items-center gap-3 p-3 rounded-2xl">
            <P className="w-10 h-10 rounded-full shrink-0" />
            <div className="space-y-1.5 flex-1">
              <P className="h-2.5 w-28" />
              <P className="h-2 w-16" />
            </div>
            <P className="h-5 w-8 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

function StatNavSkeleton() {
  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-3 shadow-xl">
      <div className="flex items-center justify-between px-1 mb-3">
        <div className="space-y-1.5">
          <P className="h-2 w-20" />
          <P className="h-3 w-36" />
        </div>
        <P className="h-6 w-16 rounded-full" />
      </div>
      <div className="flex gap-2 overflow-hidden">
        {[...Array(9)].map((_, i) => (
          <P key={i} className="shrink-0 w-14 h-9 rounded-xl" />
        ))}
      </div>
    </div>
  );
}

function ControlsSkeleton() {
  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4 shadow-xl flex flex-col md:flex-row gap-4 justify-between">
      <div className="flex gap-3 flex-wrap">
        <P className="h-10 w-64 rounded-xl" />
        <P className="h-10 w-28 rounded-xl" />
      </div>
      <div className="flex items-center gap-4">
        <P className="h-10 w-32 rounded-lg" />
        <P className="h-8 w-16 rounded-md" />
      </div>
    </div>
  );
}

function ChartSkeleton() {
  return (
    <div className="grid grid-cols-1 2xl:grid-cols-[minmax(0,1fr)_320px] gap-4">
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[2rem] p-6 shadow-2xl">
        <div className="flex gap-3 h-[300px] sm:h-[380px] items-end">
          <div className="flex flex-col justify-between h-full pb-8">
            {[...Array(5)].map((_, i) => (
              <P key={i} className="w-6 h-2" />
            ))}
          </div>
          <div className="flex-1 flex items-end gap-1.5 pb-14">
            {[70, 45, 85, 55, 90, 40, 75, 60, 80, 50, 65, 95].map((h, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-2">
                <P className="w-full rounded-t-lg" style={{ height: `${h}%` }} />
                <div className="w-full space-y-1">
                  <P className="w-full h-2" />
                  <P className="w-full h-2" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[2rem] p-5 shadow-2xl space-y-3">
        <P className="h-2 w-24" />
        <P className="h-10 w-20 rounded-xl" />
        {[...Array(5)].map((_, i) => (
          <P key={i} className="h-12 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}

function KpiCardsSkeleton() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4 space-y-2">
          <P className="h-2 w-16" />
          <P className="h-7 w-14 rounded-xl" />
          <P className="h-2 w-20" />
        </div>
      ))}
    </div>
  );
}

function InsightSkeleton() {
  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[2rem] overflow-hidden shadow-2xl">
      <div className="p-5 space-y-4">
        <div className="flex gap-4">
          <P className="w-14 h-14 rounded-2xl shrink-0" />
          <div className="space-y-2 flex-1">
            <P className="h-2 w-24" />
            <P className="h-8 w-40 rounded-xl" />
          </div>
          <P className="w-24 h-14 rounded-xl shrink-0" />
        </div>
        <div className="flex gap-2 flex-wrap">
          {[...Array(5)].map((_, i) => (
            <P key={i} className="h-6 w-20 rounded-full" />
          ))}
        </div>
      </div>
      <div className="px-5 pb-5 space-y-2">
        <P className="h-2 w-28" />
        <div className="grid grid-cols-3 gap-2">
          {[...Array(3)].map((_, i) => (
            <P key={i} className="h-10 rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  );
}

function SupportingDataSkeleton() {
  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[2rem] overflow-hidden shadow-2xl">
      <div className="px-5 py-3 border-b border-[var(--border)] flex items-center justify-between">
        <div className="space-y-1.5">
          <P className="h-2 w-28" />
          <P className="h-3 w-40" />
        </div>
        <P className="h-5 w-6" />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 p-3">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="border border-[var(--border)] rounded-2xl p-3 space-y-3">
            <div className="flex justify-between">
              <div className="flex gap-2 items-center">
                <P className="w-8 h-8 rounded-xl" />
                <div className="space-y-1.5">
                  <P className="h-1.5 w-8" />
                  <P className="h-4 w-12 rounded" />
                </div>
              </div>
              <div className="space-y-1.5 items-end flex flex-col">
                <P className="h-1.5 w-8" />
                <P className="h-3 w-8 rounded" />
              </div>
            </div>
            {/* Sparkline */}
            <P className="h-[58px] w-full rounded-lg" />
            <P className="h-1 w-full rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

function GameLogSkeleton() {
  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[2rem] overflow-hidden shadow-2xl">
      <div className="px-5 py-4 flex items-center justify-between border-b border-[var(--border)]">
        <div className="flex items-center gap-3">
          <P className="w-9 h-9 rounded-full" />
          <div className="space-y-1.5">
            <P className="h-2 w-16" />
            <P className="h-3 w-40" />
          </div>
        </div>
        <P className="w-5 h-5 rounded" />
      </div>
      <div className="p-3 space-y-1">
        {[...Array(5)].map((_, i) => (
          <P key={i} className="h-10 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}

function DvpSkeleton() {
  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[2rem] p-5 shadow-2xl">
      <div className="flex items-center gap-3 mb-5">
        <P className="w-9 h-9 rounded-xl" />
        <div className="space-y-1.5">
          <P className="h-2 w-20" />
          <P className="h-4 w-32 rounded" />
        </div>
      </div>
      <div className="space-y-2">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <P className="h-2 w-8" />
            <P className="flex-1 h-2 rounded-full" />
            <P className="h-4 w-14 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Full page skeleton ────────────────────────────────────────────────────────

export default function PlayerPageSkeleton() {
  return (
    <div
      className="p-4 md:p-6 2xl:p-8 max-w-[1700px] mx-auto space-y-4"
      aria-label="Cargando perfil del jugador..."
      aria-busy="true"
    >
      {/* Header (ancho completo) */}
      <HeaderSkeleton />

      {/* Social radar pills */}
      <SocialRadarSkeleton />

      {/* Grid: sidebar + columna principal */}
      <div className="grid grid-cols-1 xl:grid-cols-[270px_minmax(0,1fr)] gap-4 items-start">

        {/* Sidebar — oculto en mobile */}
        <div className="hidden xl:block">
          <SidebarSkeleton />
        </div>

        {/* Columna principal */}
        <div className="space-y-4 min-w-0">
          <StatNavSkeleton />
          <ControlsSkeleton />
          <ChartSkeleton />
          <KpiCardsSkeleton />
          <InsightSkeleton />
          <SupportingDataSkeleton />
          <GameLogSkeleton />
          <DvpSkeleton />
        </div>
      </div>
    </div>
  );
}

export {
  HeaderSkeleton, StatNavSkeleton, ChartSkeleton,
  InsightSkeleton, SupportingDataSkeleton, SidebarSkeleton,
};
