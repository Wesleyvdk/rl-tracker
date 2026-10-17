import "dotenv/config";
import { Client, Events, GatewayIntentBits, MessageFlags } from "discord.js";
import cron from "node-cron";
import { writeFileSync, rmSync } from "node:fs";
import { loadCommands } from "./services/commandLoader";
import { refreshLinkedProfiles } from "./services/profile.service";
import { shutdownBrowsers } from "./services/browser.service";
import { db } from "./services/database.service";
import { statusMessage, replyStatus } from "./services/commandReply.service";
import { cardPager } from "./services/cardPager.service";

const commands = await loadCommands();
if (!process.env.BOT_TOKEN) throw new Error("BOT_TOKEN is required");
const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const healthPath = process.env.HEALTH_PATH || "/tmp/rl-tracker-health.json";
let refreshing = false;
let lastRefreshAt: number | null = null;
const job = cron.schedule("0 * * * *", async () => {
  if (refreshing || !client.isReady()) return;
  refreshing = true;
  try {
    await refreshLinkedProfiles();
    lastRefreshAt = Date.now();
  } catch (error) {
    console.error("Scheduled refresh failed:", String(error));
  } finally {
    refreshing = false;
  }
});
const heartbeat = setInterval(
  () =>
    writeFileSync(
      healthPath,
      JSON.stringify({
        connected: client.isReady(),
        at: Date.now(),
        lastRefreshAttemptAt: lastRefreshAt,
        refreshing,
        lastSuccessfulProfileAt: (
          db.query("SELECT MAX(fetched_at) AS at FROM profile_cache").get() as {
            at: number | null;
          }
        ).at,
      }),
    ),
  10000,
);
client.once(Events.ClientReady, () =>
  console.log(`rl-tracker connected as ${client.user?.tag}`),
);
client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isButton()) {
    try {
      await cardPager.handle(interaction);
    } catch {
      console.warn("Card button response failed");
    }
    return;
  }
  if (!interaction.isChatInputCommand()) return;
  try {
    const command = commands.find(
      (command) => command.data.name === interaction.commandName,
    );
    if (!command)
      return replyStatus(
        interaction,
        "Command unavailable",
        "Choose a command from the menu and try again.",
      );
    await command.execute(client, interaction);
  } catch (error) {
    console.error("Command failed:", String(error));
    try {
      const payload = statusMessage(
        "Couldn't complete command",
        "Please try again shortly.",
        "error",
      );
      if (interaction.replied)
        await interaction.followUp({
          ...payload,
          flags: MessageFlags.Ephemeral,
        });
      else if (interaction.deferred) await interaction.editReply(payload);
      else
        await interaction.reply({ ...payload, flags: MessageFlags.Ephemeral });
    } catch {}
  }
});
async function shutdown() {
  job.stop();
  clearInterval(heartbeat);
  cardPager.dispose();
  await client.destroy();
  await shutdownBrowsers();
  rmSync(healthPath, { force: true });
  db.close();
  process.exit(0);
}
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
try {
  await client.login(process.env.BOT_TOKEN);
} catch (error) {
  job.stop();
  clearInterval(heartbeat);
  db.close();
  throw error;
}
