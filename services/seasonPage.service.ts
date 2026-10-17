import { load } from "cheerio";
import { parsePlaylistTable, canonicalPlaylist } from "./profileParser.service";
import {
  canonicalizeSeasonLabels,
  seasonIdFromLabel,
  normalizeSeasonLabel,
  type SeasonOption,
} from "./seasonLabel.service";
import type { SeasonData, SeasonStatsResult } from "../types";
export const SEASON_EXTRACTOR_VERSION = 2;
export function resumableSeason(
  row: SeasonData,
  fallbackTime: number | undefined,
  now = Date.now(),
) {
  const at = row.fetchedAt ?? fallbackTime;
  return (
    Number.isSafeInteger(at) &&
    at! > 0 &&
    at! <= now &&
    now - at! < (row.unavailable ? 300000 : 3600000)
  );
}
const core = new Set(["Duel 1v1", "Doubles 2v2", "Standard 3v3"]);
export function seasonPage(html: string) {
  const $ = load(html);
  const options: SeasonOption[] = canonicalizeSeasonLabels(
    $(".dropdown__item-label")
      .map((_, e) => $(e).text())
      .get(),
  ).map((label) => ({ id: seasonIdFromLabel(label)!, label }));
  const selected = [
    ...new Set(
      $(".multi-switch__item--selected, .dropdown__selected")
        .map(
          (_, e) =>
            seasonIdFromLabel($(e).text().trim()) ??
            seasonIdFromLabel($(e).find(".label").first().text()),
        )
        .get()
        .filter((id): id is number => id !== null),
    ),
  ];
  const error = $(".content--error").text().trim();
  const blocked =
    /just a moment|attention required/i.test($("title").text()) ||
    $(
      "#challenge-form,#challenge-running,iframe[src*='challenges.cloudflare.com']",
    ).length > 0;
  const rows = error || blocked ? [] : parsePlaylistTable(html);
  const noMatches =
    /\bno matches (?:played|have been played|this season)\b/i.test(
      $("table.trn-table").text(),
    );
  const busy = $(".loading-indicator, [aria-busy='true']").length > 0;
  return {
    options,
    selectedId: selected.length === 1 ? selected[0] : null,
    rows,
    noMatches,
    error,
    blocked,
    busy,
    hasTable: $("table.trn-table").length > 0,
  };
}
export function seasonFromPage(
  html: string,
  option: SeasonOption,
  competitive: boolean,
  verifiedEmpty = false,
): SeasonData | null {
  const page = seasonPage(html);
  if (page.selectedId !== option.id || page.blocked || page.error || page.busy)
    return null;
  const rows = page.rows
    .filter(
      (row) =>
        !competitive ||
        core.has(canonicalPlaylist(row.playlist).replace(/^Ranked\s+/i, "")),
    )
    .map((row) => ({
      ...row,
      matches:
        Number.isSafeInteger(row.matches) && row.matches! >= 0
          ? row.matches
          : null,
    }));
  if (!rows.length && !page.noMatches) {
    if (!verifiedEmpty || !page.hasTable || page.rows.length) return null;
    return {
      season: normalizeSeasonLabel(option.label),
      seasonId: option.id,
      playlists: {},
      totalMatches: null,
      unavailable: true,
      fetchedAt: Date.now(),
    };
  }
  const playlists = Object.fromEntries(
    rows.map((r) => [r.playlist, { rank: r.rank, matches: r.matches }]),
  );
  const totalMatches = rows.length
    ? rows.some((r) => r.matches === null)
      ? null
      : rows.reduce((n, r) => n + r.matches!, 0)
    : 0;
  return {
    season: normalizeSeasonLabel(option.label),
    seasonId: option.id,
    playlists,
    totalMatches,
    noMatches: !rows.length && page.noMatches,
    fetchedAt: Date.now(),
  };
}
export function historyResult(
  options: SeasonOption[],
  available: number,
  rows: SeasonData[],
): SeasonStatsResult {
  const ids = new Set(options.map((o) => o.id));
  const byId = new Map(
    rows
      .filter((r) => r.seasonId !== undefined && ids.has(r.seasonId))
      .map((r) => [r.seasonId!, r]),
  );
  const seasonData = options.flatMap((o) =>
    byId.has(o.id) ? [byId.get(o.id)!] : [],
  );
  return {
    seasonData,
    averageStats: [],
    extractorVersion: SEASON_EXTRACTOR_VERSION,
    partial: options.some((o) => !byId.has(o.id)),
    coverage: {
      available,
      requested: options,
      completed: options.filter((o) => byId.has(o.id)).map((o) => o.id),
      missing: options.filter((o) => !byId.has(o.id)).map((o) => o.id),
      unavailable: options
        .filter((o) => byId.get(o.id)?.unavailable)
        .map((o) => o.id),
    },
  };
}
