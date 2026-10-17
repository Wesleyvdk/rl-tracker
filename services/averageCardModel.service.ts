import type { SeasonData } from "../types";
import { seasonAverages } from "./seasonAverages.service";
import { STANDARD_MODES, nonnegative } from "./rankCardModel.service";
export function averageModel(seasons: SeasonData[]) {
  const names = [...new Set(seasons.flatMap((s) => Object.keys(s.playlists)))];
  const modes = [
    ...STANDARD_MODES.filter((p) => names.includes(p)),
    ...names.filter((p) => !STANDARD_MODES.includes(p)).sort(),
  ];
  const rows = seasons.map((s) => {
    const counts = Object.values(s.playlists).map((p) =>
      nonnegative(p.matches),
    );
    const valid = counts.filter((n): n is number => n !== null);
    const known = valid.length ? valid.reduce((a, b) => a + b, 0) : s.noMatches ? 0 : null;
    const complete =
      (counts.length > 0 || s.noMatches === true) &&
      valid.length === counts.length &&
      nonnegative(s.totalMatches) !== null &&
      s.totalMatches === known;
    return { ...s, known, complete };
  });
  const complete = rows.filter((s) => s.complete);
  return {
    modes,
    rows,
    averages: seasonAverages(seasons),
    known: rows.some((r) => r.known !== null)
      ? rows.reduce((s, r) => s + (r.known ?? 0), 0)
      : null,
    average: complete.length
      ? Math.round(complete.reduce((s, r) => s + r.known!, 0) / complete.length)
      : null,
    partial: rows.some((r) => !r.complete),
  };
}
