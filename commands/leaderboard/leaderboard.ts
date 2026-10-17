import {
  Client,
  ChatInputCommandInteraction,
  SlashCommandBuilder,
} from "discord.js";
import { getAllAccounts } from "../../services/database.service";
import { profileCache } from "../../services/profile.service";
import generateLeaderboardCard from "../../services/generateLeaderboardCard.service";
import {
  leaderboardModel,
  type BoardAccount,
} from "../../services/leaderboardModel.service";
import { replyStatus } from "../../services/commandReply.service";
import { cardPager } from "../../services/cardPager.service";
import { themePreferences } from "../../services/theme.service";

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
        {
          name: "Extra Modes (Rumble, Dropshot, Hoops, Snowday)",
          value: "extra",
        },
      ),
  );

export async function execute(
  client: Client,
  interaction: ChatInputCommandInteraction,
) {
  if (!interaction.guild)
    return replyStatus(
      interaction,
      "Server only",
      "Use this command in your server.",
    );
  const mode = (interaction.options as any).getString("mode");
  if (mode !== "competitive" && mode !== "extra")
    return replyStatus(
      interaction,
      "Choose a mode",
      "Select Competitive or Extra Modes.",
    );
  try {
    await interaction.deferReply();
    const accounts = getAllAccounts(),
      members: BoardAccount[] = [];
    for (const account of accounts) {
      try {
        await interaction.guild.members.fetch(account.discord_id);
      } catch {
        continue;
      }
      const cached = profileCache.read(account.playername, account.platform);
      members.push({
        ...account,
        stats_data: cached?.tableData || [],
        fetchedAt: cached?.fetchedAt,
        stale: cached?.stale,
      });
      if (!cached || cached.stale)
        void profileCache
          .get(account.playername, account.platform)
          .catch((error) =>
            console.warn("Leaderboard refresh failed:", error.message),
          );
    }
    if (!members.length)
      return replyStatus(
        interaction,
        "No linked players",
        "Use `/link` to join this server's leaderboard.",
      );
    if (!leaderboardModel(members, mode).total)
      return replyStatus(
        interaction,
        "No ranks yet",
        "Profiles are refreshing. Try again shortly.",
      );
    const theme = themePreferences.guildTheme(interaction.guildId);
    const images = await generateLeaderboardCard(
      members,
      mode,
      interaction.guild.name,
      false,
      theme,
    );
    return await cardPager.send(interaction, images, theme);
  } catch (error) {
    console.error(
      "Leaderboard command failed:",
      error instanceof Error ? error.message : String(error),
    );
    return replyStatus(
      interaction,
      "Couldn't load leaderboard",
      "Please try again shortly.",
      "error",
    ).catch(() => {});
  }
}
