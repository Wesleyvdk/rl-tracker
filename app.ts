import { Client, GatewayIntentBits } from "discord.js";
import { config } from "dotenv";
import handleError from "./handlers/errorHandler";
import { commands } from "./deploy";
import puppeteer from "puppeteer";
config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
  ],
});
let browser: any;
const token: string = process.env.BOT_TOKEN || "";
const clientId: string = process.env.CLIENTID || "";

client.on("ready", async () => {
  browser = await puppeteer.launch({ headless: true });
  console.log(`browser initialized`);
  console.log(`Logged in as ${client.user?.tag}!`);
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  for (const command of commands) {
    if (command.data.name === interaction.commandName) {
      await command.execute(client, interaction, browser);
      // try {
      // } catch (e) {
      //   // handleError(interaction, e, null);
      //   if (interaction.replied || interaction.deferred) {
      //     await interaction.followUp({
      //       content: "There was an error processing this command",
      //       ephemeral: true,
      //     });
      //   } else {
      //     await interaction.reply({
      //       content: "There was an error processing this command",
      //       ephemeral: true,
      //     });
      //   }
      // }
    }
  }
});

client.login(token);
