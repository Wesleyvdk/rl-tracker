import {
  Client,
  CommandInteraction,
  SlashCommandBuilder,
  MessageFlags,
} from "discord.js";
import generateAverageCard from "../../services/generateAverageCard.service";
import getSeasonStats from "../../services/getSeasonStats.service";
import { requestQueue } from "../../services/requestQueue.service";
import { getAccount } from "../../services/database.service";
import { normalizePlatform } from "../../services/trackerProfile.service";

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
      .setDescription("Number of seasons to analyze (default: 0 for ALL seasons)")
      .setRequired(false)
      .setMinValue(0);
  }).addStringOption((option) => {
    return option
      .setName('platform')
      .setDescription('The platform')
      .addChoices(
        { name: 'Epic', value: 'epic' },
        { name: 'Steam', value: 'steam' },
        { name: 'Xbox', value: 'xbox' },
        { name: 'PlayStation', value: 'psn' },
      )
  }).addBooleanOption((option) => {
    return option
      .setName('competitive_only')
      .setDescription('Only show core competitive modes (1v1, 2v2, 3v3) (default: true)')
      .setRequired(false);
  });

export async function execute(
  client: Client,
  interaction: CommandInteraction
) {
  let playername = (interaction.options as any).getString("playername");
  let platform = (interaction.options as any).getString("platform");
  const seasons = (interaction.options as any).getInteger("seasons") ?? 0;
  const competitiveOnly = (interaction.options as any).getBoolean("competitive_only") ?? true;

  if (!playername) {
    const account = getAccount(interaction.user.id);
    if (!account) {
      return interaction.reply({
        content: "❌ You haven't linked a Rocket League profile yet! Use `/link` or provide a player name.",
        flags: [MessageFlags.Ephemeral],
      });
    }
    playername = account.playername;
    // Default to the linked platform if the user didn't specify one in this command call
    platform = platform || account.platform;
  }

  // If platform is still null (user didn't specify and no link), default to epic
  platform = normalizePlatform(platform || "epic") || "epic";

  const safeReply = async (options: any) => {
    try {
      return await interaction.editReply(options);
    } catch (e: any) {
      if (e?.code === 10062) {
        console.log(`Interaction expired for ${playername} avgmatches request`);
        return;
      }
      throw e;
    }
  };

  try {
    await interaction.deferReply();
    const stats = await requestQueue.enqueue(() =>
      getSeasonStats(playername, platform, seasons, competitiveOnly)
    );

    if (stats.seasonData.length === 0) {
      let reason = `Could not find any season data for **${playername}** on ${platform}.`;
      if (stats.failureReason === "cloudflare_blocked") {
        reason = `Tracker temporarily blocked the request for **${playername}** on ${platform}. Please retry in a minute.`;
      } else if (stats.failureReason === "profile_not_found") {
        reason = `Profile for **${playername}** on ${platform} was not found. Please verify platform and player ID/name.`;
      } else if (stats.failureReason === "invalid_profile_input") {
        reason = `The provided player/platform input is invalid. Please use a valid platform and player ID/name.`;
      } else if (stats.failureReason === "table_unavailable") {
        reason = `Profile loaded for **${playername}** on ${platform}, but seasonal stats were unavailable. Please retry shortly.`;
      }
      return safeReply({
        content: reason,
      });
    }

    const cardData = {
      name: playername,
      seasonData: stats.seasonData,
      averageStats: stats.averageStats,
    };

    const image = await generateAverageCard(cardData);

    const embedObject = {
      title: `${playername}'s Match History`,
      description: `Analyzed ${stats.seasonData.length} seasons`,
      image: {
        url: `attachment://${image.name}`,
      },
      color: 0x2ecc71,
    };

    return safeReply({ embeds: [embedObject], files: [image] });
  } catch (error) {
    console.error("Error in avgmatches command:", error);
    return safeReply({
      content: `An error occurred while fetching match history for **${playername}**. Please try again later.`,
    });
  }
}
