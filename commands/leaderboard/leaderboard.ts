import {
    Client,
    CommandInteraction,
    SlashCommandBuilder,
    MessageFlags,
} from "discord.js";
import { getAllAccounts, updateStats, UserAccount } from "../../services/database.service";
import getRanksByTable from "../../services/getRanksByTable.service";
import { requestQueue } from "../../services/requestQueue.service";
import generateLeaderboardCard from "../../services/generateLeaderboardCard.service";

// Cache duration for MMR (2 hours)
const MMR_CACHE_DURATION_MS = 2 * 60 * 60 * 1000;

export const data = new SlashCommandBuilder()
    .setName("leaderboard")
    .setDescription("Show the Rocket League server leaderboard")
    .addStringOption((option) =>
        option
            .setName("mode")
            .setDescription("Which mode categories to rank by?")
            .setRequired(true)
            .addChoices(
                { name: "Competitive (1v1, 2v2, 3v3)", value: "competitive" },
                { name: "Extra Modes (Rumble, Dropshot, Hoops, Snowday)", value: "extra" }
            )
    );

export async function execute(
    client: Client,
    interaction: CommandInteraction
) {
    if (!interaction.guild) {
        return interaction.reply({
            content: "❌ This command can only be used in a server.",
            flags: [MessageFlags.Ephemeral],
        });
    }

    const modeChoice = (interaction.options as any).getString("mode") as "competitive" | "extra";
    await interaction.deferReply();

    try {
        // 1. Get ALL linked accounts from the database
        const allLinkedAccounts = getAllAccounts();

        if (allLinkedAccounts.length === 0) {
            return interaction.editReply({
                content: "No one in the database has linked their Rocket League account yet. Use `/link` to get started!",
            });
        }

        // 2. Filter down to ONLY members currently inside this specific Discord server.
        // We fetch members individually by ID to explicitly bypass the `GuildMembersTimeout` 
        // that occurs when you lack the "Privileged Server Members Intent" setting in Discord Developers.
        const validServerAccounts: any[] = [];

        for (const account of allLinkedAccounts) {
            try {
                // If they are in the server, this resolves. If they left, it throws.
                const member = await interaction.guild.members.fetch(account.discord_id);
                if (member) {
                    validServerAccounts.push({ ...account, stats_data: [] });
                }
            } catch (e) {
                // Member not in guild anymore, ignore.
            }
        }

        if (validServerAccounts.length === 0) {
            return interaction.editReply({
                content: "No one in this server has linked their Rocket League account yet. Use `/link` to get started!",
            });
        }

        const now = Date.now();
        let updatedCount = 0;

        // 3. Queue up scraping for people whose MMR is stale or missing
        for (const account of validServerAccounts) {
            const isStale = !account.last_updated || (now - account.last_updated) > MMR_CACHE_DURATION_MS;
            const isMissingData = !account.stats_json;

            if (isStale || isMissingData) {
                interaction.editReply({ content: `Fetching fresh ranks... (${updatedCount + 1}/${validServerAccounts.length})` }).catch(() => { });
                console.log(`[Leaderboard] Fetching fresh MMR for ${account.playername}...`);

                const res = await requestQueue.enqueue(() => getRanksByTable(account.playername, account.platform));
                const rankData = res as any;

                if (!rankData.error && rankData.tableData) {
                    // Cache the entire table array natively into the database
                    const statsJsonString = JSON.stringify(rankData.tableData);
                    updateStats(account.discord_id, statsJsonString);
                    account.stats_json = statsJsonString;
                    account.stats_data = rankData.tableData;
                } else {
                    console.error(`[Leaderboard] Failed to fetch MMR for ${account.playername} (${rankData.error})`);
                }
                updatedCount++;
            } else {
                // If cached, just parse the JSON string back into an object
                try {
                    account.stats_data = JSON.parse(account.stats_json);
                } catch (e) {
                    account.stats_data = [];
                }
            }
        }

        // 4. Sort Valid Accounts
        // Determine the target playlists based on the mode
        const targetPlaylists = modeChoice === "competitive"
            ? ["Duel 1v1", "Doubles 2v2", "Standard 3v3"]
            : ["Hoops", "Rumble", "Dropshot", "Snow Day"];

        // Helper function to get highest MMR for a user in the target playlists
        const getPeakMMR = (acc: any) => {
            let highest = 0;
            if (acc.stats_data && Array.isArray(acc.stats_data)) {
                for (const p of acc.stats_data) {
                    if (p.playlist) {
                        const isTarget = targetPlaylists.some(tp => p.playlist.includes(tp));
                        if (isTarget) {
                            const mmrNum = parseInt((p.mmr || "0").toString().replace(/,/g, ''), 10);
                            if (mmrNum > highest) highest = mmrNum;
                        }
                    }
                }
            }
            return highest;
        };

        // Filter out people who have ZERO mmr in all selected mode categories
        const rankedAccounts = validServerAccounts.filter(acc => getPeakMMR(acc) > 0);

        rankedAccounts.sort((a, b) => {
            return getPeakMMR(b) - getPeakMMR(a);
        });

        if (rankedAccounts.length === 0) {
            return interaction.editReply({
                content: `No one in this server has a rank for **${modeChoice}** yet!`,
            });
        }

        // Limit to Top 25 to prevent canvas height crashes
        const top25Accounts = rankedAccounts.slice(0, 25);

        // 5. Generate the custom canvas leaderboard image
        interaction.editReply({ content: `🎨 Generating ${modeChoice} leaderboard image (Top ${top25Accounts.length})...` }).catch(() => { });

        const leaderboardImage = await generateLeaderboardCard(top25Accounts, modeChoice, interaction.guild.name);

        await interaction.editReply({ content: null, files: [leaderboardImage] });

    } catch (error) {
        console.error("Error generating leaderboard:", error);
        await interaction.editReply({
            content: "❌ An error occurred while generating the leaderboard.",
        });
    }
}
