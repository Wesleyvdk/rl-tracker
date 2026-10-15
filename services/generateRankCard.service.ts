import Canvas from "@napi-rs/canvas";
import { AttachmentBuilder } from "discord.js";
import type { PlaylistStats } from "./profileParser.service";
export function rankCardHeight(count: number) {
  return 125 + Math.max(1, Math.ceil(count / 2)) * 255;
}
export default async function generateRankCard(playerData: {
  name: string;
  ranks: PlaylistStats[];
  rewardLevel?: string;
}): Promise<AttachmentBuilder> {
  const canvas = Canvas.createCanvas(
    1000,
    rankCardHeight(playerData.ranks.length),
  );
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#1a1a1d";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#fff";
  ctx.font = "bold 30px sans-serif";
  ctx.fillText(playerData.name, 25, 50, 930);
  ctx.font = "18px sans-serif";
  ctx.fillText(
    playerData.rewardLevel || "Reward level unavailable",
    25,
    85,
    930,
  );
  for (const [i, entry] of playerData.ranks.entries()) {
    const x = 25 + (i % 2) * 475,
      y = 125 + Math.floor(i / 2) * 255;
    ctx.fillStyle = "#252529";
    ctx.fillRect(x, y, 450, 230);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 22px sans-serif";
    ctx.fillText(entry.playlist, x + 20, y + 35, 410);
    ctx.fillStyle = "#f3b650";
    ctx.fillText(entry.rank, x + 20, y + 72, 410);
    ctx.fillStyle = "#ddd";
    ctx.font = "18px sans-serif";
    ctx.fillText(entry.division || "Division unavailable", x + 20, y + 103);
    ctx.fillText(
      entry.mmr === null ? "MMR unavailable" : `${entry.mmr} MMR`,
      x + 20,
      y + 133,
    );
    ctx.fillText(`Matches: ${entry.matches ?? "unavailable"}`, x + 20, y + 163);
    ctx.fillText(`Streak: ${entry.streak ?? "unavailable"}`, x + 20, y + 193);
    ctx.fillText(
      `Up: ${entry.nextMMR ?? "—"}  Down: ${entry.prevMMR ?? "—"}`,
      x + 235,
      y + 193,
    );
  }
  return new AttachmentBuilder(canvas.toBuffer("image/png"), {
    name: "rank.png",
  });
}
