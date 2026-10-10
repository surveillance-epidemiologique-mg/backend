/** Correspondance entre les noms historiques des régions et geoBoundaries ADM1. */
export function normalizeRegionName(value: string): string {
  const normalized = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  return normalized === 'matsiatra ambony' ? 'haute matsiatra' : normalized;
}
