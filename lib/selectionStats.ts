// A single interpretation for chart, summaries, game log and ticket reader.
export type SelectionSide = 'over' | 'under' | 'at_least' | 'at_most';
export type SelectionOutcome = 'hit' | 'miss' | 'push' | 'missing';
export function finiteStat(value: unknown): number | null {
  if (value == null || typeof value === 'boolean' || !['number','string','bigint'].includes(typeof value) || String(value).trim() === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
export function selectionOutcome(value: unknown, line: number, side: SelectionSide): SelectionOutcome {
  const n = finiteStat(value);
  if (n === null || !Number.isFinite(line) || line < 0) return 'missing';
  if (side === 'at_least') return n >= line ? 'hit' : 'miss';
  if (side === 'at_most') return n <= line ? 'hit' : 'miss';
  if (n === line) return 'push';
  return (side === 'under' ? n < line : n > line) ? 'hit' : 'miss';
}
export function selectionSummary(values: unknown[], line: number, side: SelectionSide) {
  const valid = values.map(finiteStat).filter((n): n is number => n !== null);
  const outcomes = values.map(value => selectionOutcome(value, line, side));
  const hits = outcomes.filter(x => x === 'hit').length;
  const misses = outcomes.filter(x => x === 'miss').length;
  const pushes = outcomes.filter(x => x === 'push').length;
  const sorted = [...valid].sort((a,b) => a-b);
  return {total:values.length, valid:valid.length, hits, misses, pushes, missing:values.length-valid.length,
    decided:hits+misses, rate:hits+misses ? hits/(hits+misses)*100 : null,
    average:valid.length ? valid.reduce((a,b)=>a+b,0)/valid.length : null,
    median:valid.length ? (sorted[Math.floor((valid.length-1)/2)]+sorted[Math.ceil((valid.length-1)/2)])/2 : null};
}
