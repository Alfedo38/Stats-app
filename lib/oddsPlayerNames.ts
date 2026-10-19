/** Normalización exacta de nombre y apellido; no usa coincidencias por semejanza. */
function plainName(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['’`´]/g, '')
    .replace(/[^a-zA-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

const SUFFIXES = new Set(['jr', 'sr', 'ii', 'iii', 'iv', 'v']);

export function canonicalOddsPlayerName(value: unknown): string {
  const raw = String(value ?? '').trim();
  const parts = raw.split(',').map(part => part.trim());
  if (parts.length === 2 && parts.every(Boolean)) {
    // «Gary Trent, Jr.» conserva su orden. «Trent Jr., Gary» se reordena.
    if (SUFFIXES.has(plainName(parts[1]))) return plainName(`${parts[0]} ${parts[1]}`);
    return plainName(`${parts[1]} ${parts[0]}`);
  }
  if (parts.length === 3 && parts.every(Boolean) && SUFFIXES.has(plainName(parts[2]))) {
    return plainName(`${parts[1]} ${parts[0]} ${parts[2]}`);
  }
  return plainName(raw);
}

export function oddsPlayerNameCandidates(value: unknown): string[] {
  const canonical = canonicalOddsPlayerName(value);
  if (!canonical) return [];
  const words = canonical.split(' ');
  // SQL busca las posibles particiones apellido/nombre; el nombre original
  // de cada fila se verifica después, antes de agrupar o mostrar precios.
  const candidates = new Set([canonical]);
  for (let cut = 1; cut < words.length; cut += 1) {
    candidates.add([...words.slice(cut), ...words.slice(0, cut)].join(' '));
  }
  if (words.length > 2 && SUFFIXES.has(words[words.length - 1])) {
    const suffix = words[words.length - 1];
    const base = words.slice(0, -1);
    for (let cut = 1; cut < base.length; cut += 1) {
      candidates.add([...base.slice(cut), ...base.slice(0, cut), suffix].join(' '));
    }
  }
  return [...candidates];
}

export function matchesOddsPlayer(displayName: unknown, storedNorm: unknown, requestedName: unknown): boolean {
  const target = canonicalOddsPlayerName(requestedName);
  if (!target) return false;
  const display = String(displayName ?? '').trim();
  // La coma del nombre original permite reconstruir el orden sin adivinar.
  // Sin un nombre original, solo aceptamos coincidencia normalizada exacta.
  return canonicalOddsPlayerName(display || storedNorm) === target;
}
