import "dotenv/config";
import { REST, Routes } from "discord.js";
import { loadCommands } from "./services/commandLoader";
import { preserveRegistrationSettings } from "./services/commandRegistration.service";

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
  // Do not overwrite registration if the existing settings cannot be read.
  const current = await rest.get(route);
  const body = preserveRegistrationSettings(
    commands.map((command) => command.data),
    current,
    !process.env.TEST_GUILD_ID,
  );
  await rest.put(route, { body });
  console.log(`Registered ${commands.length} commands.`);
}
if (import.meta.main)
  deployCommands().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
