// components/PlayerPageSkeleton.tsx
//
// Animated skeleton that mirrors the player page layout.
// Use it in loading.tsx or as a Suspense fallback.

function Shimmer({ className = "", style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <div
      className={`bg-[var(--surface-soft)] rounded-lg animate-pulse ${className}`}
      aria-hidden="true"
    />
  );
}

function ShimmerText({ w = "w-32", h = "h-3" }: { w?: string; h?: string }) {
  return <Shimmer className={`${w} ${h} rounded-md`} />;
}

// ─── Section skeletons ─────────────────────────────────────────────────────────

function HeaderSkeleton() {
  return (
    <div className="rounded-[2rem] border border-[var(--border)] bg-[var(--surface)] p-6 md:p-8 shadow-2xl">
      <ShimmerText w="w-24" h="h-2" />
      <div className="mt-3 space-y-2">
        <Shimmer className="h-10 w-56 rounded-xl" />
        <Shimmer className="h-10 w-72 rounded-xl" />
      </div>
      <div className="flex items-center gap-3 mt-4">
        <Shimmer className="w-7 h-7 rounded-full" />
        <ShimmerText w="w-28" h="h-2.5" />
      </div>
      <div className="mt-6 pt-5 border-t border-[var(--border)]/50 grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="space-y-2">
            <ShimmerText w="w-16" h="h-2" />
            <ShimmerText w="w-12" h="h-6" />
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
          <ShimmerText w="w-20" h="h-2" />
          <ShimmerText w="w-36" h="h-2.5" />
        </div>
        <Shimmer className="w-16 h-6 rounded-full" />
      </div>
      <div className="flex gap-2 overflow-hidden">
        {[...Array(8)].map((_, i) => (
          <Shimmer key={i} className="shrink-0 w-14 h-8 rounded-xl" />
        ))}
      </div>
    </div>
  );
}

function ControlsSkeleton() {
  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4 shadow-xl flex flex-col md:flex-row gap-4 justify-between">
      <div className="flex gap-3">
        <Shimmer className="h-10 w-72 rounded-xl" />
        <Shimmer className="h-10 w-32 rounded-xl" />
      </div>
      <div className="flex items-center gap-4">
        <Shimmer className="h-10 w-32 rounded-lg" />
        <Shimmer className="h-8 w-16 rounded-md" />
      </div>
    </div>
  );
}

function ChartSkeleton() {
  return (
    <div className="grid grid-cols-1 2xl:grid-cols-[minmax(0,1fr)_320px] gap-4">
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[2rem] p-6 shadow-2xl">
        {/* Y axis */}
        <div className="flex gap-3 h-[380px] items-end">
          <div className="flex flex-col justify-between h-full pb-8">
            {[...Array(5)].map((_, i) => (
              <ShimmerText key={i} w="w-6" h="h-2" />
            ))}
          </div>
          {/* Bars */}
          <div className="flex-1 flex items-end gap-2 pb-14">
            {[70, 45, 85, 55, 90, 40, 75, 60, 80, 50].map((h, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-2">
                <Shimmer
                  className="w-full rounded-t-lg"
                  style={{ height: `${h}%` } as React.CSSProperties}
                />
                <div className="space-y-1 w-full">
                  <ShimmerText w="w-full" h="h-2" />
                  <ShimmerText w="w-full" h="h-2" />
                  <ShimmerText w="w-full" h="h-2" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Alt lines panel */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[2rem] p-5 shadow-2xl space-y-3">
        <ShimmerText w="w-24" h="h-2" />
        <ShimmerText w="w-16" h="h-8" />
        {[...Array(5)].map((_, i) => (
          <Shimmer key={i} className="h-12 w-full rounded-xl" />
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
          <ShimmerText w="w-16" h="h-2" />
          <ShimmerText w="w-12" h="h-7" />
          <ShimmerText w="w-20" h="h-2" />
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
          <Shimmer className="w-14 h-14 rounded-2xl" />
          <div className="space-y-2 flex-1">
            <ShimmerText w="w-24" h="h-2" />
            <ShimmerText w="w-40" h="h-7" />
          </div>
          <Shimmer className="w-24 h-14 rounded-xl" />
        </div>
        <div className="flex gap-2 flex-wrap">
          {[...Array(5)].map((_, i) => (
            <Shimmer key={i} className="h-6 w-20 rounded-full" />
          ))}
        </div>
      </div>
      <div className="px-5 pb-5 space-y-2">
        <ShimmerText w="w-28" h="h-2" />
        <div className="grid grid-cols-3 gap-2">
          {[...Array(3)].map((_, i) => (
            <Shimmer key={i} className="h-10 rounded-xl" />
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
          <ShimmerText w="w-28" h="h-2" />
          <ShimmerText w="w-40" h="h-3" />
        </div>
        <ShimmerText w="w-6" h="h-2" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 p-3">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="border border-[var(--border)] rounded-2xl p-3 space-y-3">
            <div className="flex justify-between">
              <div className="flex gap-2 items-center">
                <Shimmer className="w-7 h-7 rounded-full" />
                <div className="space-y-1.5">
                  <ShimmerText w="w-8" h="h-1.5" />
                  <ShimmerText w="w-12" h="h-4" />
                </div>
              </div>
              <div className="space-y-1.5 items-end flex flex-col">
                <ShimmerText w="w-8" h="h-1.5" />
                <ShimmerText w="w-8" h="h-3" />
              </div>
            </div>
            <Shimmer className="h-[60px] w-full rounded-lg" />
            <Shimmer className="h-1 w-full rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

function GameLogSkeleton() {
  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[2rem] overflow-hidden shadow-2xl">
      <div className="px-5 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Shimmer className="w-9 h-9 rounded-full" />
          <div className="space-y-1.5">
            <ShimmerText w="w-16" h="h-2" />
            <ShimmerText w="w-40" h="h-3" />
          </div>
        </div>
        <Shimmer className="w-5 h-5 rounded" />
      </div>
    </div>
  );
}

function SidebarSkeleton() {
  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[2rem] overflow-hidden shadow-2xl">
      <div className="p-4 border-b border-[var(--border)] space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-1.5">
            <ShimmerText w="w-12" h="h-2" />
            <ShimmerText w="w-20" h="h-5" />
          </div>
          <Shimmer className="w-10 h-6 rounded-full" />
        </div>
        <Shimmer className="h-10 w-full rounded-xl" />
      </div>
      <div className="p-2 space-y-1">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="flex items-center gap-3 p-3 rounded-2xl">
            <Shimmer className="w-10 h-10 rounded-full" />
            <div className="space-y-1.5 flex-1">
              <ShimmerText w="w-32" h="h-2.5" />
              <ShimmerText w="w-20" h="h-2" />
            </div>
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
      className="grid grid-cols-1 xl:grid-cols-[280px_minmax(0,1fr)] gap-6"
      aria-label="Cargando perfil del jugador..."
      aria-busy="true"
    >
      {/* Left sidebar */}
      <div className="hidden xl:block">
        <SidebarSkeleton />
      </div>

      {/* Main content */}
      <div className="space-y-5 min-w-0">
        <HeaderSkeleton />
        <StatNavSkeleton />
        <ControlsSkeleton />
        <ChartSkeleton />
        <KpiCardsSkeleton />
        <InsightSkeleton />
        <SupportingDataSkeleton />
        <GameLogSkeleton />
      </div>
    </div>
  );
}

// ── Partial skeletons (export individually if needed) ──────────────────────────
export {
  HeaderSkeleton,
  StatNavSkeleton,
  ChartSkeleton,
  InsightSkeleton,
  SupportingDataSkeleton,
  SidebarSkeleton,
};
