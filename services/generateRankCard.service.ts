import Canvas from "@napi-rs/canvas";
import { PlayerData, RankInfo } from "../types";
import { AttachmentBuilder } from "discord.js";

const rankColors: { [key: string]: string } = {
  "Supersonic Legend": "#ffffff",
  "Grand Champion III": "#ff004c",
  "Grand Champion II": "#ff004c",
  "Grand Champion I": "#ff004c",
  "Champion III": "#a500ff",
  "Champion II": "#a500ff",
  "Champion I": "#a500ff",
  "Diamond III": "#00bfff",
  "Diamond II": "#00bfff",
  "Diamond I": "#00bfff",
  "Platinum III": "#00ff00",
  "Platinum II": "#00ff00",
  "Platinum I": "#00ff00",
  "Gold III": "#ffd700",
  "Gold II": "#ffd700",
  "Gold I": "#ffd700",
  "Silver III": "#c0c0c0",
  "Silver II": "#c0c0c0",
  "Silver I": "#c0c0c0",
  "Bronze III": "#cd7f32",
  "Bronze II": "#cd7f32",
  "Bronze I": "#cd7f32",
};

export default async function generateRankCard(playerData: any): Promise<any> {
  const width = 1000;
  const height = 650;
  const canvas = Canvas.createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  // Background color
  ctx.fillStyle = "#1a1a1d";
  ctx.fillRect(0, 0, width, height);

  // Title
  ctx.fillStyle = "#3a3a40";
  ctx.fillRect(0, 0, width, 100);
  ctx.fillStyle = "#fff";
  ctx.font = "bold 30px Arial";
  ctx.fillText(playerData.name, 30, 60);
  ctx.fillText(playerData.rewardLevel, 700, 60);

  // Create cards for each game mode
  const cardWidth = 450;
  const cardHeight = 230;
  const cardSpacing = 25;

  const unranked = {
    rank: "Unranked",
    division: "",
    rating: 0,
    streak: 0,
    nextMMR: null,
    prevMMR: null,
    matches: null,
    icon: "",
  };

  for (let i = 0; i < playerData.ranks.length; i++) {
    const playlistData = playerData.ranks[i];
    let mode = playlistData.playlist ?? unranked;
    const x = (i % 2) * (cardWidth + cardSpacing) + cardSpacing;
    const y = Math.floor(i / 2) * (cardHeight + cardSpacing) + 125;

    // Card background
    ctx.fillStyle = "#252529";
    ctx.fillRect(x, y, cardWidth, cardHeight);

    // Rank Icon (optional)
    if (mode) {
      const icon = await Canvas.loadImage(playlistData.icon);
      ctx.drawImage(icon, x + 320, y + 60, 100, 100);
    }

    // Mode Title
    ctx.fillStyle = "#fff";
    ctx.font = "bold 20px Arial";
    ctx.fillText(mode, x + 25, y + 45);

    // Rank
    ctx.font = "bold 24px Arial";
    ctx.fillStyle = rankColors[playlistData.rank] || "#f39c12";
    ctx.fillText(playlistData.rank, x + 25, y + 75);

    // Division & MMR
    ctx.font = "20px Arial";
    ctx.fillStyle = "#fff";
    ctx.fillText(`${playlistData.division}`, x + 25, y + 100);
    ctx.fillText(`${playlistData.mmr} MMR`, x + 25, y + 135);
    // Stats

    ctx.font = "18px Arial";
    if (playlistData.streak > 0) {
      const wins = parseInt(playlistData.streak, 10);
      ctx.fillStyle = "#2ecc71"; // Green for wins
      ctx.fillText(
        wins === 1 ? `${wins} Win` : `${wins} Wins`,
        x + 340,
        y + 180
      );
    } else if (playlistData.streak < 0) {
      const losses = parseInt(playlistData.streak, 10);
      ctx.fillStyle = "#e74c3c"; // Red for losses
      ctx.fillText(
        losses === 1 ? `${losses} Loss` : `${losses} Losses`,
        x + 340,
        y + 180
      );
    } else {
      ctx.fillStyle = "#fff"; // Default color for no streak
      ctx.fillText(`Streak: ${playlistData.streak}`, x + 340, y + 180);
    }
    ctx.fillStyle = "#fff";
    ctx.fillText(`Matches: ${playlistData.matches}`, x + 25, y + 200);

    // MMR Differences
    ctx.font = "18px Arial";
    ctx.fillStyle = playlistData.nextMMR !== null ? "#2ecc71" : "#e74c3c";
    ctx.fillText(
      playlistData.nextMMR !== null ? `+${playlistData.nextMMR}` : "0",
      x + 270,
      y + 120
    );

    ctx.fillStyle = playlistData.prevMMR !== null ? "#e74c3c" : "#aaa";
    ctx.fillText(
      playlistData.prevMMR !== null ? `-${playlistData.prevMMR}` : "0",
      x + 270,
      y + 140
    );
  }

  // Save the image
  const attachment = new AttachmentBuilder(canvas.toBuffer("image/png"), {
    name: "rank-card.png",
  });

  return attachment;
}
