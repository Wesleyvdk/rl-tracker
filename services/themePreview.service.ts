import generateRankCard from "./generateRankCard.service";
import { STANDARD_MODES } from "./rankCardModel.service";
export function previewInput(theme: string) {
  const at = Date.now();
  const ranks = STANDARD_MODES.map((playlist, i) => ({
    playlist,
    rank: ["Champion I", "Grand Champion II", "Champion III", "Diamond III"][
      i % 4
    ],
    division: "Division III",
    mmr: 1280 + i * 41,
    matches: 52 + i * 19,
    streak: i % 3 === 0 ? -2 : 3 + i,
    icon: null,
    nextMMR: 18,
    prevMMR: 22,
  }));
  return {
    name: "Aether",
    theme,
    platform: "Epic",
    preview: true,
    fetchedAt: at,
    rewardLevel: "Champion rewards",
    ranks,
    history: Object.fromEntries(
      ranks.map((r, i) => [
        r.playlist,
        Array.from({ length: 20 }, (_, n) => ({
          at: at - (19 - n) * 1800000,
          mmr:
            n === 9 && i === 2
              ? null
              : Math.round(r.mmr - (19 - n) * 2 + Math.sin(n / 2 + i) * 12),
        })),
      ]),
    ),
  };
}
export default function themePreview(theme: string) {
  return generateRankCard(previewInput(theme));
}
