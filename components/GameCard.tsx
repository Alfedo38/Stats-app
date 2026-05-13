import { MapPin } from 'lucide-react';

interface GameCardProps {
  homeTeam: string;
  awayTeam: string;
  time: string;
  location?: string;
}

export default function GameCard({ homeTeam, awayTeam, time, location }: GameCardProps) {
  return (
    <div className="min-w-[300px] snap-start bg-[var(--surface)] p-5 rounded-2xl border border-[var(--border)] hover:border-emerald-500/50 transition-all cursor-pointer group">
      <div className="flex justify-between items-center mb-4">
        <span className="text-[10px] font-bold text-emerald-500 bg-emerald-500/10 px-2 py-1 rounded uppercase tracking-widest">
          NBA Live
        </span>
        <span className="text-xs text-[var(--text-muted)] font-medium">{time}</span>
      </div>

      <div className="space-y-3">
        <div className="flex justify-between items-center">
          <span className="font-bold text-lg text-[var(--text)] transition-colors">{awayTeam}</span>
          <span className="text-xs text-[var(--text-muted)] font-bold italic underline decoration-emerald-500/30">@</span>
          <span className="font-bold text-lg text-[var(--text)] transition-colors">{homeTeam}</span>
        </div>
      </div>

      {location && (
        <div className="mt-4 flex items-center gap-1 text-[var(--text-muted)]">
          <MapPin size={12} />
          <span className="text-[10px] uppercase font-semibold">{location}</span>
        </div>
      )}
    </div>
  );
}
