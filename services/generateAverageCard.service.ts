import Canvas from "@napi-rs/canvas";
import { AttachmentBuilder } from "discord.js";
import { SeasonData, AverageStats } from "../types";

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

interface AverageCardData {
  name: string;
  seasonData: SeasonData[];
  averageStats: AverageStats[];
}

export default async function generateAverageCard(data: AverageCardData): Promise<any> {
  const corePlaylists = ["Ranked Doubles 2v2", "Ranked Standard 3v3", "Ranked Duel 1v1", "Tournament Matches"];
  const allPlaylistsSet = new Set<string>();
  data.seasonData.forEach(s => Object.keys(s.playlists).forEach(p => allPlaylistsSet.add(p)));
  const fetchedPlaylists = Array.from(allPlaylistsSet);

  const displayPlaylists = [
    ...corePlaylists.filter(p => fetchedPlaylists.includes(p)),
    ...fetchedPlaylists.filter(p => !corePlaylists.includes(p)).sort()
  ];

  const colPlaylistWidth = 160;
  const colSeasonWidth = 120;
  const colTotalWidth = 120;
  const requiredWidth = 40 + colSeasonWidth + colTotalWidth + (displayPlaylists.length * colPlaylistWidth);
  const width = Math.max(1000, requiredWidth);

  // Dynamic height mapping: Base headers (340px) + (Rows * 32px) + Footer (120px)
  const reqHeight = 340 + (data.seasonData.length * 32) + 120;
  const height = Math.max(800, reqHeight);

  const canvas = Canvas.createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  // Background color
  ctx.fillStyle = "#1a1a1d";
  ctx.fillRect(0, 0, width, height);

  // Header
  ctx.fillStyle = "#3a3a40";
  ctx.fillRect(0, 0, width, 80);
  ctx.fillStyle = "#fff";
  ctx.font = "bold 28px Arial";
  ctx.fillText(`${data.name} - Match History`, 30, 50);

  // Average Stats Section
  ctx.fillStyle = "#2a2a30";
  ctx.fillRect(20, 100, width - 40, 180);

  ctx.fillStyle = "#fff";
  ctx.font = "bold 22px Arial";
  ctx.fillText(`Average Stats (Last ${data.seasonData.length} Seasons)`, 40, 135);

  // Show key averages
  const keyPlaylists = ["Ranked Doubles 2v2", "Ranked Standard 3v3", "Ranked Duel 1v1"];
  let avgX = 40;

  for (const playlistName of keyPlaylists) {
    const stat = data.averageStats.find(s => s.playlist === playlistName);
    if (stat) {
      const shortName = playlistName.replace("Ranked ", "").replace(" 3v3", "").replace(" 2v2", "").replace(" 1v1", "");

      ctx.font = "bold 16px Arial";
      ctx.fillStyle = "#888";
      ctx.fillText(shortName, avgX, 170);

      ctx.font = "bold 24px Arial";
      ctx.fillStyle = rankColors[stat.averageRankName] || "#fff";
      ctx.fillText(stat.averageRankName, avgX, 200);

      ctx.font = "18px Arial";
      ctx.fillStyle = "#2ecc71";
      ctx.fillText(`${stat.averageMatches} avg matches`, avgX, 230);

      avgX += 310;
    }
  }

  // Season breakdown
  ctx.fillStyle = "#fff";
  ctx.font = "bold 20px Arial";
  ctx.fillText("Matches Per Season", 40, 310);

  // Table header
  const tableY = 340;
  const headers = ["Season", ...displayPlaylists.map(p => p.replace("Ranked ", "").replace(" Matches", "")), "Total"];
  const colWidths = [colSeasonWidth, ...displayPlaylists.map(() => colPlaylistWidth), colTotalWidth];

  ctx.fillStyle = "#3a3a40";
  ctx.fillRect(20, tableY, width - 40, 35);

  ctx.fillStyle = "#fff";
  ctx.font = "bold 14px Arial";
  let headerX = 30;
  headers.forEach((header, i) => {
    ctx.fillText(header, headerX, tableY + 23);
    headerX += colWidths[i];
  });

  // Table rows
  const rowHeight = 32;
  let rowY = tableY + 35;

  for (let i = 0; i < data.seasonData.length; i++) {
    const season = data.seasonData[i] as any;

    // Alternate row colors
    ctx.fillStyle = i % 2 === 0 ? "#252529" : "#2a2a2e";
    ctx.fillRect(20, rowY, width - 40, rowHeight);

    ctx.font = "14px Arial";
    let cellX = 30;

    // Season name
    ctx.fillStyle = "#fff";
    ctx.fillText(season.season, cellX, rowY + 21);
    cellX += colWidths[0];

    // Playlist matches
    displayPlaylists.forEach((playlist, j) => {
      const matches = season.playlists[playlist]?.matches || 0;
      const rank = season.playlists[playlist]?.rank || "";

      if (matches > 0) {
        ctx.fillStyle = rankColors[rank] || "#2ecc71";
        ctx.fillText(matches.toLocaleString(), cellX, rowY + 21);
      } else {
        ctx.fillStyle = "#555";
        ctx.fillText("-", cellX, rowY + 21);
      }
      cellX += colWidths[j + 1];
    });

    // Total
    ctx.fillStyle = "#2ecc71";
    ctx.font = "bold 14px Arial";
    ctx.fillText(season.totalMatches?.toLocaleString() || "0", cellX, rowY + 21);

    rowY += rowHeight;
  }

  // Total matches across all seasons
  const grandTotal = data.seasonData.reduce((sum: number, s: any) => sum + (s.totalMatches || 0), 0);
  const avgPerSeason = Math.round(grandTotal / data.seasonData.length);

  ctx.fillStyle = "#3a3a40";
  ctx.fillRect(20, rowY + 10, width - 40, 50);

  ctx.fillStyle = "#fff";
  ctx.font = "bold 18px Arial";
  ctx.fillText(`Grand Total: ${grandTotal.toLocaleString()} matches`, 40, rowY + 43);
  ctx.fillText(`Average: ${avgPerSeason.toLocaleString()} per season`, 500, rowY + 43);

  // Save the image
  const attachment = new AttachmentBuilder(canvas.toBuffer("image/png"), {
    name: "average-matches.png",
  });

  return attachment;
}
