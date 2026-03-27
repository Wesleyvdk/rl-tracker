import {
    Client,
    CommandInteraction,
    SlashCommandBuilder,
    MessageFlags,
} from "discord.js";
import { unlinkAccount } from "../../services/database.service";

export const data = new SlashCommandBuilder()
    .setName("unlink")
    .setDescription("Unlink your Rocket League Tracker profile");

export async function execute(
    client: Client,
    interaction: CommandInteraction
) {
    const discordId = interaction.user.id;

    try {
        const success = unlinkAccount(discordId);

        if (success) {
            await interaction.reply({
                content: "✅ Your Discord account has been unlinked from your Rocket League profile.",
                flags: [MessageFlags.Ephemeral],
            });
        } else {
            await interaction.reply({
                content: "ℹ️ You don't have a linked Rocket League profile to remove.",
                flags: [MessageFlags.Ephemeral],
            });
        }
    } catch (error) {
        console.error("Error unlinking account:", error);
        await interaction.reply({
            content: "❌ An error occurred while unlinking your account. Please try again later.",
            flags: [MessageFlags.Ephemeral],
        });
    }
}
