import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Colors,
  Interaction,
  Message,
} from "discord.js";
import moment from "moment/moment.js";
let CurrentDate = moment().format();

export default function handleError(interaction: any, e: any, message: any) {
  let embed = new EmbedBuilder()
    .setDescription("There was an error, please notify the creator of the bot")
    .setColor(Colors.Red);
  const buttonComponent = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel("support")
      .setURL("https://discord.gg/pYzZd3DbDq")
      .setStyle(ButtonStyle.Link)
  );
  const stackTrace = e.stack ? e.stack.split("\n")[1].trim() : "N/A";
  if (!interaction) {
    message.reply({
      embeds: [embed],
      components: [buttonComponent],
    });
    console.log(`Error: ${e}\n in server: ${message.guild?.name}`);
    console.log(`Date/Time: ${CurrentDate}`);
    console.log(`Stack Trace: ${stackTrace}`);
  }
  if (!message) {
    interaction.editReply({
      embeds: [embed],
      components: [buttonComponent],
    });
    console.log(`Error: ${e}\n in server: ${interaction.guild?.name}`);
    console.log(`Date/Time: ${CurrentDate}`);
    console.log(`Stack Trace: ${stackTrace}`);
  }
}
