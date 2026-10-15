import "dotenv/config";
import { REST, Routes } from "discord.js";
import { loadCommands } from "./services/commandLoader";

export async function deployCommands() {
  if (!process.env.BOT_TOKEN || !process.env.CLIENTID)
    throw new Error("BOT_TOKEN and CLIENTID are required");
  const commands = await loadCommands();
  const rest = new REST({ version: "10" }).setToken(process.env.BOT_TOKEN);
  const route = process.env.TEST_GUILD_ID
    ? Routes.applicationGuildCommands(
        process.env.CLIENTID,
        process.env.TEST_GUILD_ID,
      )
    : Routes.applicationCommands(process.env.CLIENTID);
  await rest.put(route, { body: commands.map((command) => command.data) });
  console.log(`Registered ${commands.length} commands.`);
}
if (import.meta.main)
  deployCommands().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
