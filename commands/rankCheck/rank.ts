import {
  Client,
  CommandInteraction,
  EmbedBuilder,
  SlashCommandBuilder,
  MessageFlags,
} from "discord.js";
import generateRankCard from "../../services/generateRankCard.service";
import { PlayerData } from "../../types";
import path from "path";
import getRanksByTable from "../../services/getRanksByTable.service";
import { requestQueue } from "../../services/requestQueue.service";
import { getAccount, updateStats } from "../../services/database.service";
import { normalizePlatform } from "../../services/trackerProfile.service";
export const data = new SlashCommandBuilder()
  .setName("rank")
  .setDescription("Replies with your rank!")
  .addStringOption((option) => {
    return option
      .setName("playername")
      .setDescription("The player's name (optional if linked)")
      .setRequired(false);
  })

export async function execute(
  client: Client,
  interaction: CommandInteraction
) {
  let playername = (interaction.options as any).getString("playername");
  let platform = "epic";

  if (!playername) {
    const account = getAccount(interaction.user.id);
    if (!account) {
      return interaction.reply({
        content: "❌ You haven't linked a Rocket League profile yet! Use `/link` or provide a player name.",
        flags: [MessageFlags.Ephemeral],
      });
    }
    playername = account.playername;
    platform = normalizePlatform(account.platform) || "epic";
  }

  const safeReply = async (options: any) => {
    try {
      return await interaction.editReply(options);
    } catch (e: any) {
      if (e?.code === 10062) {
        console.log(`Interaction expired for ${playername} rank request`);
        return;
      }
      throw e;
    }
  };

  try {
    await interaction.deferReply();

    // Check if the user is checking their OWN linked account vs a random string
    const isLinkedAccount = !!(interaction.options as any).getString("playername") === false;
    const discordId = interaction.user.id;

    const ranks = await requestQueue.enqueue(() =>
      getRanksByTable(playername, platform)
    );

    if (ranks.error) {
      return safeReply({ content: ranks.error });
    }

    // Passively keep the leaderboard cache warm
    if (isLinkedAccount && ranks.tableData) {
      updateStats(discordId, JSON.stringify(ranks.tableData));
    }

    const playerData = {
      name: playername,
      ranks: ranks.tableData,
      rewardLevel: ranks.parsedRewardLevel,
    };

    const image = await generateRankCard(playerData);

    const embedObject = {
      title: `${interaction.user.username}'s rank`,
      image: {
        url: `attachment://${image.name}`,
      },
    };
    return safeReply({ embeds: [embedObject], files: [image] });
  } catch (error) {
    console.error("Error in rank command:", error);
    return safeReply({
      content: `An error occurred while fetching rank for **${playername}**. Please try again later.`,
    });
  }
}
