import Canvas from "@napi-rs/canvas";
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

export default async function generateLeaderboardCard(
    validAccounts: any[],
    modeChoice: "competitive" | "extra",
    guildName: string
): Promise<any> {
    const width = 1200;
    // Dynamic height based on number of players
    const height = 150 + (validAccounts.length * 200);
    const canvas = Canvas.createCanvas(width, height);
    const ctx = canvas.getContext("2d");

    // Background color
    ctx.fillStyle = "#1a1a1d";
    ctx.fillRect(0, 0, width, height);

    // Title
    ctx.fillStyle = "#3a3a40";
    ctx.fillRect(0, 0, width, 100);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 40px Arial";

    const title = modeChoice === "competitive"
        ? "🏆 Competitive Leaderboard"
        : "🏆 Extra Modes Leaderboard";

    ctx.fillText(`${title} - ${guildName}`, 30, 65);

    const targetPlaylists = modeChoice === "competitive"
        ? ["Duel 1v1", "Doubles 2v2", "Standard 3v3"]
        : ["Hoops", "Rumble", "Dropshot", "Snow Day"];

    for (let i = 0; i < validAccounts.length; i++) {
        const account = validAccounts[i];
        const y = 130 + (i * 200);

        // Player Row Background
        ctx.fillStyle = "#252529";
        ctx.fillRect(30, y, width - 60, 180);

        // Rank Number
        ctx.fillStyle = "#f39c12";
        ctx.font = "bold 40px Arial";
        ctx.fillText(`#${i + 1}`, 50, y + 100);

        // Player Name
        ctx.fillStyle = "#fff";
        ctx.font = "bold 32px Arial";
        ctx.fillText(account.playername, 120, y + 100);

        // Draw columns for the playlists
        for (let pIndex = 0; pIndex < targetPlaylists.length; pIndex++) {
            const playlistName = targetPlaylists[pIndex];
            // Find playlist data from parsed stats JSON
            let playlistData = null;
            if (account.stats_data && Array.isArray(account.stats_data)) {
                playlistData = account.stats_data.find((p: any) => p.playlist && p.playlist.includes(playlistName));
            }

            const colX = 400 + (pIndex * 220);

            // Playlist Title
            ctx.fillStyle = "#aaa";
            ctx.font = "bold 18px Arial";
            ctx.fillText(playlistName, colX, y + 40);

            if (playlistData && playlistData.mmr) {
                // Rank Icon
                if (playlistData.icon) {
                    try {
                        const icon = await Canvas.loadImage(playlistData.icon);
                        ctx.drawImage(icon, colX, y + 55, 60, 60);
                    } catch (e) {
                        // skip broken image
                    }
                }

                // Rank Name
                ctx.fillStyle = rankColors[playlistData.rank] || "#f39c12";
                ctx.font = "bold 16px Arial";
                ctx.fillText(playlistData.rank, colX + 70, y + 75);

                // MMR
                ctx.fillStyle = "#fff";
                ctx.font = "16px Arial";
                ctx.fillText(`${playlistData.mmr} MMR`, colX + 70, y + 100);

                // Division
                ctx.fillStyle = "#888";
                ctx.font = "14px Arial";
                ctx.fillText(playlistData.division || "", colX + 70, y + 120);
            } else {
                ctx.fillStyle = "#555";
                ctx.font = "italic 16px Arial";
                ctx.fillText("Unranked", colX, y + 90);
            }
        }
    }

    // Save the image
    const attachment = new AttachmentBuilder(canvas.toBuffer("image/png"), {
        name: "leaderboard.png",
    });

    return attachment;
}
