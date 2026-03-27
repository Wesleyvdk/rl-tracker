import {
    Client,
    CommandInteraction,
    SlashCommandBuilder,
    MessageFlags,
} from "discord.js";
import { linkAccount, getAccount } from "../../services/database.service";

export const data = new SlashCommandBuilder()
    .setName("link")
    .setDescription("Link your Discord account to a Rocket League Tracker profile")
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
                { name: "PlayStation", value: "psn" }
            );
    });

export async function execute(
    client: Client,
    interaction: CommandInteraction
) {
    const playername = (interaction.options as any).getString("playername");
    const platform = (interaction.options as any).getString("platform") || "epic";
    const discordId = interaction.user.id;

    try {
        linkAccount(discordId, playername, platform);

        await interaction.reply({
            content: `✅ Successfully linked your Discord account to **${playername}** (${platform}). You can now use \`/avgmatches\` and \`/rank\` without typing your name!`,
            flags: [MessageFlags.Ephemeral],
        });
    } catch (error) {
        console.error("Error linking account:", error);
        await interaction.reply({
            content: "❌ An error occurred while linking your account. Please try again later.",
            flags: [MessageFlags.Ephemeral],
        });
    }
}
