const ALLOWED_PLATFORMS = ["epic", "steam", "xbox", "psn"] as const;
export type TrackerPlatform = (typeof ALLOWED_PLATFORMS)[number];

export function normalizePlatform(platform: string | null | undefined): TrackerPlatform | null {
  if (!platform) return null;
  const normalized = platform.trim().toLowerCase();
  if (normalized === "playstation" || normalized === "ps") return "psn";
  if ((ALLOWED_PLATFORMS as readonly string[]).includes(normalized)) {
    return normalized as TrackerPlatform;
  }
  return null;
}

export function buildTrackerProfileUrl(
  platformInput: string | null | undefined,
  usernameInput: string | null | undefined
): { ok: true; platform: TrackerPlatform; username: string; url: string } | { ok: false; error: string } {
  const platform = normalizePlatform(platformInput ?? "epic");
  if (!platform) {
    return { ok: false, error: "Unsupported platform. Use epic, steam, xbox, or psn." };
  }

  const username = (usernameInput ?? "").trim();
  if (!username) {
    return { ok: false, error: "Player name is required." };
  }

  const encodedUsername = encodeURIComponent(username);
  const url = `https://rocketleague.tracker.network/rocket-league/profile/${platform}/${encodedUsername}/overview`;
  return { ok: true, platform, username, url };
}
