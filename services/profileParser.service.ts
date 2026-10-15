import { load } from "cheerio";
export interface PlaylistStats {
  playlist: string;
  rank: string;
  division: string;
  mmr: number | null;
  matches: number | null;
  streak: number | null;
  icon: string | null;
  nextMMR: number | null;
  prevMMR: number | null;
}
export interface ProfileResult {
  tableData?: PlaylistStats[];
  parsedRewardLevel?: string;
  fetchedAt?: number;
  stale?: boolean;
  error?: string;
  failureReason?:
    | "invalid_profile_input"
    | "profile_not_found"
    | "blocked"
    | "table_unavailable"
    | "timeout"
    | "fetch_failed";
}
export function parseInteger(value: string): number | null {
  const text = value.trim().replaceAll(",", "").replaceAll("\u00a0", "");
  if (!/^-?\d+$/.test(text)) return null;
  const number = Number(text);
  return Number.isSafeInteger(number) ? number : null;
}
export function canonicalPlaylist(name: string): string {
  return /^snow\s*day$/i.test(name.trim()) ? "Snow Day" : name.trim();
}
export function parseProfileHtml(html: string): ProfileResult {
  const $ = load(html);
  const title = $("title").text();
  const body = $("body").text();
  if (
    /just a moment|attention required/i.test(title) ||
    $(
      '#challenge-form, #challenge-running, iframe[src*="challenges.cloudflare.com"]',
    ).length
  )
    return {
      error: "Tracker could not be retrieved right now.",
      failureReason: "blocked",
    };
  if (/player not found/i.test($(".content--error").text()))
    return {
      error: "Player profile not found.",
      failureReason: "profile_not_found",
    };
  const tableData: PlaylistStats[] = [];
  $("table.trn-table tbody tr").each((_, row) => {
    const item = $(row);
    const playlist = canonicalPlaylist(item.find(".playlist").first().text());
    if (!playlist || /^casual$/i.test(playlist)) return;
    const fullRank = item.find("td.name .rank").first().text().trim();
    const rank = fullRank.split(/\s+Division\s+/)[0] || "Unranked";
    const division = /\bDivision\s+([IVX]+)\b/.exec(fullRank)?.[0] || "";
    const mmr = parseInteger(item.find(".mmr .value").first().text());
    const matches = parseInteger(item.find("td.matches .value").first().text());
    const result = item.find("td.matches .result").text().trim();
    const streakMatch = result.match(/\d+/);
    const streak = streakMatch
      ? Number(streakMatch[0]) * (/loss/i.test(result) ? -1 : 1)
      : null;
    if (tableData.some((entry) => entry.playlist === playlist))
      throw new Error(`Duplicate playlist: ${playlist}`);
    tableData.push({
      playlist,
      rank,
      division,
      mmr,
      matches,
      streak,
      icon: item.find("td.icon-container img").attr("src") || null,
      nextMMR: parseInteger(item.find("td.change .up").first().text()),
      prevMMR: parseInteger(item.find("td.change .down").first().text()),
    });
  });
  if (
    !tableData.length ||
    tableData.every((row) => row.mmr === null && row.rank === "Unranked")
  )
    return {
      error: /network error|server error/i.test(body)
        ? "Tracker returned an error page."
        : "Profile loaded without a usable rank table.",
      failureReason: "table_unavailable",
    };
  // Extract only the immediate reward label, never all nested card contents.
  const reward = $('[class*="reward"]')
    .filter((_, node) => $(node).text().trim().length < 80)
    .first()
    .text()
    .trim();
  return {
    tableData,
    parsedRewardLevel: reward || "Reward level unavailable",
    fetchedAt: Date.now(),
  };
}
