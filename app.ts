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
import { createThemeEditorHandler } from "./services/themeEditorWeb.service";
import { organizations } from "./services/organization.service";
import { guildActor } from "./services/guildAuthorization.service";
import { botPresence } from "./services/botIdentity.service";

const commands = await loadCommands();
if (!process.env.BOT_TOKEN) throw new Error("BOT_TOKEN is required");
const client = new Client({
  intents: [GatewayIntentBits.Guilds],
  presence: botPresence(),
});
const editor = process.env.THEME_EDITOR_BASE_URL
  ? Bun.serve({
      hostname: process.env.THEME_EDITOR_HOST || "0.0.0.0",
      port: Number(process.env.THEME_EDITOR_PORT || 8790),
      maxRequestBodySize: 16384,
      fetch: createThemeEditorHandler({
        baseUrl: process.env.THEME_EDITOR_BASE_URL,
        clientId: process.env.CLIENTID || "",
        clientSecret: process.env.CLIENTSECRET || "",
        store: organizations,
        authorize: (guild, user, signal) =>
          guildActor(client, guild, user, signal),
      }),
    })
  : undefined;
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
        presence: {
          status: client.user?.presence.status,
          activities: client.user?.presence.activities.map(
            ({ name, type }) => ({
              name,
              type,
            }),
          ),
        },
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
  if (interaction.isAutocomplete()) {
    try {
      const command = commands.find(
        (c) => c.data.name === interaction.commandName,
      );
      if (command?.autocomplete) await command.autocomplete(interaction);
      else await interaction.respond([]);
    } catch {
      await interaction.respond([]).catch(() => {});
    }
    return;
  }
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
  await editor?.stop(true);
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
  await editor?.stop(true);
  clearInterval(heartbeat);
  db.close();
  throw error;
}
