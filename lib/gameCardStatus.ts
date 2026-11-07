// Calendar is the source of the event identity. A separately matched scoreboard
// can confirm progress, but must never turn a final back into a scheduled game.
export function gameCardStatus(calendarStatus: number | null | undefined, scoreboardState: unknown, start: string | null, now: number): "final" | "live" | "scheduled" | "unknown" {
  if (calendarStatus === 3 || scoreboardState === "post") return "final";
  const startsAt = start ? Date.parse(start) : NaN;
  const elapsed = now - startsAt;
  if (calendarStatus === 2 || scoreboardState === "in") {
    return elapsed > 8 * 60 * 60 * 1000 ? "unknown" : "live";
  }
  if (calendarStatus === 1 && !(elapsed >= 30 * 60 * 1000)) return "scheduled";
  return "unknown";
}

export function carouselArrows(width: number, contentWidth: number, left: number) {
  return { previous: left > 1, next: contentWidth - width - left > 1 };
}
