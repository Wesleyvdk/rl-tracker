import {
  Client,
  ChatInputCommandInteraction,
  SlashCommandBuilder,
} from "discord.js";
import { buildTrackerProfileUrl } from "../../services/trackerProfile.service";
import { linkAccount } from "../../services/database.service";
import { replyStatus, playerLabel } from "../../services/commandReply.service";

export const data = new SlashCommandBuilder()
  .setName("link")
  .setDescription(
    "Link your Discord account to a Rocket League Tracker profile",
  )
  .addStringOption((option) => {
    return option
      .setName("playername")
      .setDescription("Your Rocket League player name")
      .setRequired(true);
  })
  .addStringOption((option) => {
    return option
      .setName("platform")
      .setDescription("The platform you play on (default: epic)")
      .addChoices(
        { name: "Epic", value: "epic" },
        { name: "Steam", value: "steam" },
        { name: "Xbox", value: "xbox" },
        { name: "PlayStation", value: "psn" },
      );
  });

export async function execute(
  client: Client,
  interaction: ChatInputCommandInteraction,
) {
  const options = interaction.options as any,
    profile = buildTrackerProfileUrl(
      options.getString("platform") || "epic",
      options.getString("playername"),
    );
  if (!profile.ok)
    return replyStatus(interaction, "Invalid profile", profile.error, "error");
  try {
    linkAccount(interaction.user.id, profile.username, profile.platform);
    return await replyStatus(
      interaction,
      "Profile linked",
      `**${playerLabel(profile.username)}** · ${profile.platform.toUpperCase()}`,
      "success",
    );
  } catch (error) {
    console.error(
      "Link command failed:",
      error instanceof Error ? error.message : String(error),
    );
    return replyStatus(
      interaction,
      "Couldn't link profile",
      "Please try again.",
      "error",
    ).catch(() => {});
  }
}
