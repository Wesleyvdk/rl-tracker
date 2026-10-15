import type { SeasonData, AverageStats } from "../types";
const ranks = [
  "Bronze I",
  "Bronze II",
  "Bronze III",
  "Silver I",
  "Silver II",
  "Silver III",
  "Gold I",
  "Gold II",
  "Gold III",
  "Platinum I",
  "Platinum II",
  "Platinum III",
  "Diamond I",
  "Diamond II",
  "Diamond III",
  "Champion I",
  "Champion II",
  "Champion III",
  "Grand Champion I",
  "Grand Champion II",
  "Grand Champion III",
  "Supersonic Legend",
];
export function seasonAverages(seasons: SeasonData[]): AverageStats[] {
  const stats = new Map<string, { matches: number[]; tiers: number[] }>();
  for (const season of seasons)
    for (const [playlist, row] of Object.entries(season.playlists)) {
      const current = stats.get(playlist) || { matches: [], tiers: [] };
      if (row.matches !== null) current.matches.push(row.matches);
      const tier = ranks.indexOf(row.rank) + 1;
      if (tier > 0) current.tiers.push(tier);
      stats.set(playlist, current);
    }
  return [...stats].map(([playlist, row]) => {
    const tier = row.tiers.length
      ? Math.round(row.tiers.reduce((a, b) => a + b, 0) / row.tiers.length)
      : 0;
    return {
      playlist,
      averageMatches: row.matches.length
        ? Math.round(
            row.matches.reduce((a, b) => a + b, 0) / row.matches.length,
          )
        : null,
      averageRankTier: tier,
      averageRankName: tier ? ranks[tier - 1] : "Unranked",
    };
  });
}
