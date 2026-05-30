export function toFiniteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;

  if (typeof value === "string") {
    const cleaned = value.trim();
    if (!cleaned || cleaned.toLowerCase() === "nan" || cleaned.toLowerCase() === "null") return null;

    if (cleaned.includes(":")) {
      const [mRaw, sRaw = "0"] = cleaned.split(":");
      const minutes = Number(mRaw);
      const seconds = Number(sRaw);
      if (!Number.isFinite(minutes)) return null;
      return minutes + (Number.isFinite(seconds) ? seconds / 60 : 0);
    }

    const n = Number(cleaned.replace("m", "").replace("%", ""));
    return Number.isFinite(n) ? n : null;
  }

  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function roundNumber(value: unknown, digits = 1): number | null {
  const n = toFiniteNumber(value);
  if (n === null) return null;
  return Number(n.toFixed(digits));
}

export function formatNumber(value: unknown, digits = 1): string {
  const n = roundNumber(value, digits);
  if (n === null) return "—";
  return n.toFixed(digits).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}

export function formatPercent(value: unknown, digits = 1): string {
  const n = toFiniteNumber(value);
  if (n === null) return "—";
  const normalized = n > 0 && n <= 1 ? n * 100 : n;
  return `${formatNumber(normalized, digits)}%`;
}

export function getMinutesValue(row: any): number | null {
  const raw =
    row?.min_clean ??
    row?.minutes_clean ??
    row?.min_decimal ??
    row?.minutes_decimal ??
    row?.minutes ??
    row?.min ??
    row?.minutes_played ??
    row?.min_sec ??
    row?.period_minutes ??
    row?.mp ??
    null;

  return roundNumber(raw, 1);
}

export function formatMinutes(value: unknown): string {
  const n = roundNumber(value, 1);
  if (n === null) return "—";
  return n.toFixed(1).replace(/\.0$/, "");
}

export function formatTableNumber(value: unknown, digits = 1): string {
  return formatNumber(value, digits);
}

/**
 * Normaliza fechas tipo YYYY-MM-DD sin pasar por new Date().
 * Esto evita el bug de timezone donde 2026-05-20 se muestra como 19/05 en Argentina.
 */
export function normalizeDateOnly(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) {
    const y = value.getUTCFullYear();
    const m = String(value.getUTCMonth() + 1).padStart(2, "0");
    const d = String(value.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  const raw = String(value).trim();
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const slash = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (slash) {
    const d = slash[1].padStart(2, "0");
    const m = slash[2].padStart(2, "0");
    const yRaw = slash[3];
    const y = yRaw.length === 2 ? `20${yRaw}` : yRaw;
    return `${y}-${m}-${d}`;
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  const y = parsed.getUTCFullYear();
  const m = String(parsed.getUTCMonth() + 1).padStart(2, "0");
  const d = String(parsed.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function formatDateOnly(value: unknown, opts: { year?: boolean } = {}): string {
  const date = normalizeDateOnly(value);
  if (!date) return "S/D";
  const [y, m, d] = date.split("-");
  return opts.year ? `${d}/${m}/${String(y).slice(-2)}` : `${d}/${m}`;
}

export function getDateSortValue(value: unknown): number {
  const date = normalizeDateOnly(value);
  if (!date) return 0;
  const [y, m, d] = date.split("-").map(Number);
  return y * 10000 + m * 100 + d;
}

export function formatSeasonLabel(value: unknown, fallbackDate?: unknown): string {
  const raw = String(value ?? "").trim();

  // NBA season_id puede venir como 22025: lo mostramos 2025-26.
  const seasonCode = raw.match(/^2(\d{4})$/);
  if (seasonCode) {
    const start = Number(seasonCode[1]);
    if (Number.isFinite(start)) return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
  }

  if (/^\d{4}-\d{2}$/.test(raw)) return raw;

  if (/^\d{4}$/.test(raw)) {
    const start = Number(raw);
    return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
  }

  const date = normalizeDateOnly(fallbackDate);
  if (date) {
    const y = Number(date.slice(0, 4));
    const month = Number(date.slice(5, 7));
    const start = month >= 10 ? y : y - 1;
    return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
  }

  return raw || "S/D";
}

export function formatStatNumber(value: unknown, digits = 1): string {
  return formatNumber(value, digits);
}
