import { db } from "./database.service";
import getSeasonStats from "./getSeasonStats.service";
import { SeasonCache } from "./seasonCache.service";
import type { SeasonStatsResult } from "../types";
export const seasonCache = new SeasonCache(db, getSeasonStats);
export async function getSeasonStatsCached(
  name: string,
  platform: string,
  seasons: number,
  competitive: boolean,
): Promise<SeasonStatsResult> {
  return seasonCache.get(name, platform, seasons, competitive);
}
