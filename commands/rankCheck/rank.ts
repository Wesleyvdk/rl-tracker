import {
  Client,
  ChatInputCommandInteraction,
  SlashCommandBuilder,
} from "discord.js";
import generateRankCard from "../../services/generateRankCard.service";
import { profileCache } from "../../services/profile.service";
import { getAccount, updateStats } from "../../services/database.service";
import { buildTrackerProfileUrl } from "../../services/trackerProfile.service";
import { STANDARD_MODES } from "../../services/rankCardModel.service";
import { replyStatus, imageMessage } from "../../services/commandReply.service";

export const data = new SlashCommandBuilder()
  .setName("rank")
  .setDescription("Replies with your rank!")
  .addStringOption((option) => {
    return option
      .setName("playername")
      .setDescription("The player's name (optional if linked)")
      .setRequired(false);
  });

export async function execute(
  client: Client,
  interaction: ChatInputCommandInteraction,
) {
  const supplied = (interaction.options as any).getString("playername");
  const account = supplied ? null : getAccount(interaction.user.id);
  if (!supplied && !account)
    return replyStatus(
      interaction,
      "Profile needed",
      "Use `/link` or enter a player name.",
    );
  const profile = buildTrackerProfileUrl(
    account?.platform || "epic",
    supplied || account?.playername,
  );
  if (!profile.ok)
    return replyStatus(interaction, "Invalid profile", profile.error, "error");
  try {
    await interaction.deferReply();
    const ranks = await profileCache.get(profile.username, profile.platform);
    if (!ranks.tableData?.length)
      return replyStatus(
        interaction,
        "Stats unavailable",
        ranks.failureReason === "profile_not_found"
          ? "That profile wasn't found."
          : "Tracker is unavailable. Try again shortly.",
        "error",
      );
    if (account)
      updateStats(
        interaction.user.id,
        JSON.stringify(ranks.tableData),
        account,
        ranks.fetchedAt,
      );
    const key = profileCache.key(profile.username, profile.platform),
      at = ranks.fetchedAt || 0;
    const image = await generateRankCard({
      name: profile.username,
      platform: profile.platform,
      ranks: ranks.tableData,
      rewardLevel: ranks.parsedRewardLevel,
      fetchedAt: ranks.fetchedAt,
      stale: ranks.stale,
      bestWinStreaks: profileCache.history.bestWinStreaks(key, at),
      history: profileCache.history.read(
        key,
        [...STANDARD_MODES, ...ranks.tableData.map((r) => r.playlist)],
        at,
      ),
    });
    return interaction.editReply(imageMessage([image]));
  } catch (error) {
    console.error(
      "Rank command failed:",
      error instanceof Error ? error.message : String(error),
    );
    return replyStatus(
      interaction,
      "Couldn't load ranks",
      "Please try again shortly.",
      "error",
    ).catch(() => {});
  }
}
