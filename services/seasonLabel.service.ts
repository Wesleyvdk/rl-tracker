export function parseGamesFromLabel(label: string): number {
  const match = label.match(/\((\d+)\)/);
  return match ? parseInt(match[1], 10) : 0;
}

export function normalizeSeasonLabel(label: string): string {
  const withMatches = label.match(/Season\s+(\d+)\s*\((\d+)\)/i);
  if (withMatches) return `S${withMatches[1]} (${withMatches[2]})`;
  return label.trim();
}

export function canonicalizeSeasonLabels(labels: string[]): string[] {
  const trimmedUnique = Array.from(new Set(labels.map((label) => label.trim()).filter(Boolean)));
  const numberedWithCount = new Set<number>();

  for (const label of trimmedUnique) {
    const match = label.match(/Season\s+(\d+)\s*\(\d+\)/i);
    if (match) numberedWithCount.add(parseInt(match[1], 10));
  }

  return trimmedUnique.filter((label) => {
    const bareMatch = label.match(/^Season\s+(\d+)$/i);
    if (!bareMatch) return true;
    const seasonNumber = parseInt(bareMatch[1], 10);
    return !numberedWithCount.has(seasonNumber);
  });
}
