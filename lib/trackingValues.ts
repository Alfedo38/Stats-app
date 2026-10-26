// Un dato de tracking ausente no representa un cero deportivo.
export function trackingValue(value: unknown): number | null {
  if (value !== null && typeof value === 'object' &&
      typeof (value as { toNumber?: unknown }).toNumber === 'function') {
    try { value = (value as { toNumber: () => unknown }).toNumber(); }
    catch { return null; }
  }
  if (value === null || value === undefined || typeof value === 'boolean' ||
      (typeof value !== 'number' && typeof value !== 'string' && typeof value !== 'bigint') ||
      (typeof value === 'string' && value.trim() === '')) return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n <= Number.MAX_SAFE_INTEGER ? n : null;
}
