export interface SeasonOption {
  id: number;
  label: string;
}
// Parentheses identify the season. They never indicate matches played.
export function seasonIdFromLabel(label: string): number | null {
  const match = /^(?:Season\s*|S)(\d+)(?:\s*\((\d+)\))?$/i.exec(label.trim());
  if (!match) return null;
  const id = Number(match[2] || match[1]);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}
export function normalizeSeasonLabel(label: string): string {
  const match = /^(?:Season\s*|S)(\d+)(?:\s*\((\d+)\))?$/i.exec(label.trim());
  return match
    ? `${match[2] ? "S" : "Legacy S"}${Number(match[1])}`
    : label.trim();
}
export function canonicalizeSeasonLabels(labels: string[]): string[] {
  const seen = new Set<number>();
  return labels
    .map((s) => s.trim())
    .filter((label) => {
      const id = seasonIdFromLabel(label);
      if (id === null || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
}
