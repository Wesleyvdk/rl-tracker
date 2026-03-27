import { Client, GatewayIntentBits } from "discord.js";
import { config } from "dotenv";
import handleError from "./handlers/errorHandler";
import { commands } from "./deploy";
import cron from "node-cron";
import { getAllAccounts, updateStats } from "./services/database.service";
import getRanksByTable from "./services/getRanksByTable.service";
config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
  ],
});
const token: string = process.env.BOT_TOKEN || "";
const clientId: string = process.env.CLIENTID || "";

/** Cleanly shut down Discord client on exit. */
async function shutdown(signal: string) {
  console.log(`[SHUTDOWN] Received ${signal}...`);
  try { client.destroy(); } catch (_) { }
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

client.on("ready", async () => {
  console.log(`Logged in as ${client.user?.tag}!`);

  // --- BACKGROUND CRON JOB: Hourly Cache Refresh ---
  // Runs at minute 0 past every hour
  cron.schedule("0 * * * *", async () => {
    console.log("[CRON] Starting hourly MMR refresh for stale accounts...");

    const allAccounts = getAllAccounts();
    const staleThreshold = Date.now() - (60 * 60 * 1000); // 1 hour

    // Find accounts older than 1 hour or missing JSON
    const staleAccounts = allAccounts.filter(acc => !acc.last_updated || acc.last_updated < staleThreshold || !acc.stats_json);

    console.log(`[CRON] Found ${staleAccounts.length} stale accounts to refresh.`);

    // Process sequentially to avoid rate limits
    for (const account of staleAccounts) {
      try {
        console.log(`[CRON] Refreshing ${account.playername}...`);
        const res = await getRanksByTable(account.playername, account.platform);

        if (!res.error && res.tableData) {
          updateStats(account.discord_id, JSON.stringify(res.tableData));
          console.log(`[CRON] Successfully updated ${account.playername}.`);
        }
      } catch (e) {
        console.error(`[CRON] Error refreshing ${account.playername}:`, e);
      }

      // Wait 10 seconds between requests to avoid Tracker.gg bans
      await new Promise(r => setTimeout(r, 10000));
    }
    console.log("[CRON] Hourly refresh complete.");
  });
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  for (const command of commands) {
    if (command.data.name === interaction.commandName) {
      // Don't await — let each command run independently so the event loop
      // stays free to handle new interactions (deferReply has a 3s deadline)
      Promise.resolve(command.execute(client, interaction)).catch(async (e: any) => {
        console.error(`Unhandled error in command ${interaction.commandName}:`, e);
        try {
          if (interaction.replied || interaction.deferred) {
            await interaction.followUp({
              content: "There was an error processing this command",
              ephemeral: true,
            });
          } else {
            await interaction.reply({
              content: "There was an error processing this command",
              ephemeral: true,
            });
          }
        } catch (_) {
          // Interaction may have expired, nothing we can do
        }
      });
    }
  }
});

client.login(token);
