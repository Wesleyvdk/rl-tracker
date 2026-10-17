import type { PlaylistStats } from "./profileParser.service";
import { canonicalPlaylist } from "./profileParser.service";
import { nonnegative } from "./rankCardModel.service";
export const BOARD_MODES = {
  competitive: ["Ranked Duel 1v1", "Ranked Doubles 2v2", "Ranked Standard 3v3"],
  extra: ["Hoops", "Rumble", "Dropshot", "Snow Day"],
};
export interface BoardAccount {
  discord_id: string;
  playername: string;
  stats_data: PlaylistStats[];
  fetchedAt?: number;
  stale?: boolean;
}
export function boardPlaylist(name: string) {
  return canonicalPlaylist(name).replace(/^Ranked /, "");
}
export function leaderboardModel(
  accounts: BoardAccount[],
  mode: "competitive" | "extra",
) {
  const modes = BOARD_MODES[mode];
  const rows = accounts
    .map((account) => {
      const selected = modes.map((name) =>
        account.stats_data.find(
          (p) => boardPlaylist(p.playlist) === boardPlaylist(name),
        ),
      );
      const valid = selected.flatMap((p) => {
        const n = nonnegative(p?.mmr);
        return n === null ? [] : [n];
      });
      return {
        ...account,
        selected,
        score: valid.length ? Math.max(...valid) : null,
      };
    })
    .filter((row): row is typeof row & { score: number } => row.score !== null)
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.playername.localeCompare(b.playername, "en") ||
        a.discord_id.localeCompare(b.discord_id, "en"),
    );
  return { modes, total: rows.length, rows: rows.slice(0, 25) };
}
