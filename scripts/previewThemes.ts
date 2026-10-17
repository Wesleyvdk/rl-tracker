import Canvas from "@napi-rs/canvas";
import { mkdirSync, writeFileSync } from "node:fs";
import { themeRegistry } from "../services/themeRegistry.service";
import { previewInput } from "../services/themePreview.service";
import generateRank from "../services/generateRankCard.service";
import generateAverage from "../services/generateAverageCard.service";
import generateBoard from "../services/generateLeaderboardCard.service";
import { text } from "../services/cardTheme.service";

const out = process.argv[2] || "benchmark/results/theme-system/previews";
mkdirSync(out, { recursive: true });
const themes = themeRegistry.all(),
  gallery = Canvas.createCanvas(1600, 1340),
  ctx = gallery.getContext("2d");
ctx.fillStyle = "#e5e0d7";
ctx.fillRect(0, 0, 1600, 1340);
text(ctx, "CARD THEMES", 24, 42, 26, "#292e34", 1500, true);
text(
  ctx,
  "Design previews · fictional stats · RSC is an organization concept",
  24,
  69,
  17,
  "#565c62",
  1500,
);
for (const [i, theme] of themes.entries()) {
  const input = previewInput(theme.id),
    rank = await generateRank(input);
  writeFileSync(`${out}/rank-${theme.id}.png`, rank.attachment as Buffer);
  const board = await generateBoard(
    input.ranks.map((_, n) => ({
      discord_id: String(n),
      playername: ["Aether", "Nova", "Orbit"][n % 3] + n,
      stats_data: input.ranks.map((r) => ({ ...r, mmr: r.mmr - n * 15 })),
      fetchedAt: input.fetchedAt,
    })),
    "competitive",
    "Example League",
    true,
    theme.id,
  );
  writeFileSync(`${out}/board-${theme.id}.png`, board[0].attachment as Buffer);
  const history = await generateAverage({
    name: "Aether",
    theme: theme.id,
    preview: true,
    fetchedAt: input.fetchedAt,
    seasonData: Array.from({ length: 8 }, (_, n) => ({
      season: `S${24 - n}`,
      totalMatches: input.ranks.length * 50,
      playlists: Object.fromEntries(
        input.ranks.map((r) => [r.playlist, { rank: r.rank, matches: 50 }]),
      ),
    })),
  });
  for (const [n, image] of history.entries())
    writeFileSync(
      `${out}/history-${theme.id}-${n + 1}.png`,
      image.attachment as Buffer,
    );
  const x = 24 + (i % 3) * 526,
    y = 112 + Math.floor(i / 3) * 600;
  text(
    ctx,
    theme.name + (theme.id === "slate" ? " · DEFAULT" : ""),
    x,
    y,
    24,
    "#292e34",
    490,
    true,
  );
  const bitmap = await Canvas.loadImage(rank.attachment as Buffer);
  ctx.drawImage(bitmap, x, y + 15, 500, 556.25);
}
writeFileSync(`${out}/theme-gallery.png`, gallery.toBuffer("image/png"));
console.log(`Theme previews saved to ${out}`);
