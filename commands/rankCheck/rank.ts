import {
  Client,
  CommandInteraction,
  EmbedBuilder,
  SlashCommandBuilder,
} from "discord.js";
import generateRankCard from "../../services/generateRankCard.service";
import { PlayerData } from "../../types";
import path from "path";
import getRanksByTable from "../../services/getRanksByTable.service";
export const data = new SlashCommandBuilder()
  .setName("rank")
  .setDescription("Replies with your rank!")
  .addStringOption((option) => {
    return option
      .setName("playername")
      .setDescription("The player's name")
      .setRequired(true);
  });

export async function execute(
  client: Client,
  interaction: CommandInteraction,
  browser: any
) {
  await interaction.deferReply();
  let playername = (interaction.options as any).getString("playername") || "";
  const ranks = await getRanksByTable(browser, playername);

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
  return interaction.editReply({ embeds: [embedObject], files: [image] }); // files: [image]
}
