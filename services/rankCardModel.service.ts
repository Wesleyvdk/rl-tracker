import type { PlaylistStats } from "./profileParser.service";
import { summarizeHistory, type MmrHistory } from "./mmrHistory.service";

export const STANDARD_MODES = [
  "Ranked Duel 1v1",
  "Ranked Doubles 2v2",
  "Ranked Standard 3v3",
  "Dropshot",
  "Hoops",
  "Rumble",
  "Snow Day",
];
const families = [
  "Bronze",
  "Silver",
  "Gold",
  "Platinum",
  "Diamond",
  "Champion",
  "Grand Champion",
];
const colors = [
  "#c69070",
  "#c2d0e2",
  "#f3cb72",
  "#6cddcf",
  "#6abaff",
  "#bc9aff",
  "#ff7b9c",
];
export interface RankCardInput {
  name: string;
  ranks: PlaylistStats[];
  rewardLevel?: string;
  platform?: string;
  fetchedAt?: number;
  stale?: boolean;
  history?: MmrHistory;
  preview?: boolean;
}
export function rankAppearance(rank: string) {
  if (rank === "Supersonic Legend") return { color: "#eadfff", icon: 22 };
  for (const [i, family] of families.entries()) {
    const tier = ["I", "II", "III"].indexOf(rank.slice(family.length + 1));
    if (rank.startsWith(family + " ") && tier >= 0)
      return { color: colors[i], icon: 1 + i * 3 + tier };
  }
  return { color: "#a4b6cc", icon: rank === "Unranked" ? 0 : null };
}
export function nonnegative(value: number | null | undefined) {
  return Number.isSafeInteger(value) && value! >= 0 ? value! : null;
}
export function makeRankCardModel(input: RankCardInput, now = Date.now()) {
  const at =
    Number.isSafeInteger(input.fetchedAt) &&
    input.fetchedAt! > 0 &&
    input.fetchedAt! <= now + 60000
      ? input.fetchedAt!
      : null;
  const names = [
    ...STANDARD_MODES,
    ...input.ranks
      .map((r) => r.playlist)
      .filter((p) => !STANDARD_MODES.includes(p)),
  ];
  const modes = [...new Set(names)].map((playlist) => {
    const row = input.ranks.find((r) => r.playlist === playlist),
      rank = row?.rank || "Rank unavailable";
    const up = nonnegative(row?.nextMMR),
      down = nonnegative(row?.prevMMR);
    return {
      playlist,
      rank,
      division: row?.division || "Division unavailable",
      mmr: nonnegative(row?.mmr),
      matches: nonnegative(row?.matches),
      streak: Number.isSafeInteger(row?.streak) ? row!.streak : null,
      up,
      down,
      progress:
        up !== null && down !== null && up + down > 0
          ? down / (up + down)
          : null,
      ...rankAppearance(rank),
      history: summarizeHistory(
        at ? input.history?.[playlist] || [] : [],
        at || 0,
      ),
    };
  });
  if (modes.length > 32)
    throw new Error("Rank card supports at most 32 named playlists");
  return {
    modes,
    at,
    stale: !!input.stale || (at !== null && now - at > 3600000),
    available: modes.filter((m) => m.mmr !== null).length,
  };
}
/** Time-proportional positions; null values and >6h gaps interrupt the path. */
export function historyGeometry(
  points: { at: number; mmr: number | null }[],
  width: number,
  height: number,
) {
  const values = points.filter(
    (p): p is { at: number; mmr: number } => p.mmr !== null,
  );
  if (!values.length) return [];
  const low = Math.min(...values.map((p) => p.mmr)),
    high = Math.max(...values.map((p) => p.mmr));
  const pad = Math.max(10, (high - low) * 0.15),
    span = high - low + pad * 2;
  const start = points[0].at,
    duration = points.at(-1)!.at - start;
  return points.map((p, i) => ({
    x: duration ? ((p.at - start) / duration) * width : width / 2,
    y: p.mmr === null ? null : height - ((p.mmr - low + pad) / span) * height,
    join:
      i > 0 &&
      p.mmr !== null &&
      points[i - 1].mmr !== null &&
      p.at - points[i - 1].at <= 6 * 3600000,
  }));
}
