/** Normalisation identique au frontend pour matcher shapeName ↔ nom_zone. */
export function normalizeRegionName(value: string): string {
  const normalized = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  // geoBoundaries uses the Malagasy name for Haute Matsiatra.
  return normalized === 'matsiatra ambony' ? 'haute matsiatra' : normalized;
}
