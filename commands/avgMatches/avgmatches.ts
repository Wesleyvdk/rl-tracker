import {
  Client,
  ChatInputCommandInteraction,
  SlashCommandBuilder,
} from "discord.js";
import generateAverageCard, {
  HistoryCardLimitError,
} from "../../services/generateAverageCard.service";
import { getSeasonStatsCached } from "../../services/season.service";
import { getAccount } from "../../services/database.service";
import { buildTrackerProfileUrl } from "../../services/trackerProfile.service";
import { replyStatus, imageMessage } from "../../services/commandReply.service";

export const data = new SlashCommandBuilder()
  .setName("avgmatches")
  .setDescription("Shows your average matches and season breakdown")
  .addStringOption((option) => {
    return option
      .setName("playername")
      .setDescription("The player's name (optional if linked)")
      .setRequired(false);
  })
  .addIntegerOption((option) => {
    return option
      .setName("seasons")
      .setDescription(
        "Number of seasons to analyze (default: 0 for ALL seasons)",
      )
      .setRequired(false)
      .setMinValue(0);
  })
  .addStringOption((option) => {
    return option
      .setName("platform")
      .setDescription("The platform")
      .addChoices(
        { name: "Epic", value: "epic" },
        { name: "Steam", value: "steam" },
        { name: "Xbox", value: "xbox" },
        { name: "PlayStation", value: "psn" },
      );
  })
  .addBooleanOption((option) => {
    return option
      .setName("competitive_only")
      .setDescription(
        "Only show core competitive modes (1v1, 2v2, 3v3) (default: true)",
      )
      .setRequired(false);
  });

export async function execute(
  client: Client,
  interaction: ChatInputCommandInteraction,
) {
  const options = interaction.options as any,
    supplied = options.getString("playername");
  const account = supplied ? null : getAccount(interaction.user.id);
  if (!supplied && !account)
    return replyStatus(
      interaction,
      "Profile needed",
      "Use `/link` or enter a player name.",
    );
  const profile = buildTrackerProfileUrl(
    options.getString("platform") || account?.platform || "epic",
    supplied || account?.playername,
  );
  if (!profile.ok)
    return replyStatus(interaction, "Invalid profile", profile.error, "error");
  try {
    await interaction.deferReply();
    const stats = await getSeasonStatsCached(
      profile.username,
      profile.platform,
      options.getInteger("seasons") ?? 0,
      options.getBoolean("competitive_only") ?? true,
    );
    if (!stats.seasonData.length)
      return replyStatus(
        interaction,
        "History unavailable",
        stats.failureReason === "profile_not_found"
          ? "That profile wasn't found."
          : "No season history is available. Try again shortly.",
        "error",
      );
    const images = await generateAverageCard({
      name: profile.username,
      seasonData: stats.seasonData,
      averageStats: stats.averageStats,
      fetchedAt: stats.fetchedAt,
      stale: stats.stale,
    });
    return interaction.editReply(imageMessage(images));
  } catch (error) {
    console.error(
      "Season command failed:",
      error instanceof Error ? error.message : String(error),
    );
    return replyStatus(
      interaction,
      "Couldn't load history",
      error instanceof HistoryCardLimitError
        ? error.message
        : "Please try again shortly.",
      "error",
    ).catch(() => {});
  }
}
