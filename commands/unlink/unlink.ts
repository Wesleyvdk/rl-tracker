import {
  Client,
  ChatInputCommandInteraction,
  SlashCommandBuilder,
} from "discord.js";
import { unlinkAccount } from "../../services/database.service";
import { replyStatus } from "../../services/commandReply.service";

export const data = new SlashCommandBuilder()
  .setName("unlink")
  .setDescription("Unlink your Rocket League Tracker profile");

export async function execute(
  client: Client,
  interaction: ChatInputCommandInteraction,
) {
  try {
    const removed = unlinkAccount(interaction.user.id);
    return await replyStatus(
      interaction,
      removed ? "Profile unlinked" : "Nothing to unlink",
      removed
        ? "Your saved link has been removed."
        : "No profile is linked to your account.",
      removed ? "success" : "info",
    );
  } catch (error) {
    console.error(
      "Unlink command failed:",
      error instanceof Error ? error.message : String(error),
    );
    return replyStatus(
      interaction,
      "Couldn't unlink profile",
      "Please try again.",
      "error",
    ).catch(() => {});
  }
}
