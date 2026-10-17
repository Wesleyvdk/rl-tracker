import "dotenv/config";
import { REST, Routes, type RESTGetCurrentApplicationResult } from "discord.js";
import { botDescription, botTags } from "../services/botIdentity.service";

/** Only description and discovery tags are managed; startup never edits the profile. */
export async function syncBotProfile(
  rest: REST,
  expectedApplicationId: string,
  apply = false,
) {
  const route = Routes.currentApplication();
  const before = (await rest.get(route)) as RESTGetCurrentApplicationResult;
  if (before.id !== expectedApplicationId)
    throw new Error("The token does not belong to CLIENTID.");
  const matches = (app: RESTGetCurrentApplicationResult) =>
    app.description === botDescription &&
    JSON.stringify([...(app.tags ?? [])].sort()) ===
      JSON.stringify([...botTags].sort());
  const changed = !matches(before);
  if (apply && changed)
    await rest.patch(route, {
      body: { description: botDescription, tags: [...botTags] },
    });
  if (apply) {
    const after = (await rest.get(route)) as RESTGetCurrentApplicationResult;
    if (after.id !== expectedApplicationId || !matches(after))
      throw new Error("Discord profile verification failed.");
  }
  return {
    applicationId: before.id,
    name: before.name,
    description: botDescription,
    tags: [...botTags],
    changed,
    applied: apply,
  };
}

if (import.meta.main) {
  try {
    if (!process.env.BOT_TOKEN || !process.env.CLIENTID)
      throw new Error("BOT_TOKEN and CLIENTID are required.");
    const args = process.argv.slice(2);
    if (args.some((arg) => arg !== "--apply"))
      throw new Error("Usage: bun run profile [--apply]");
    const rest = new REST({ version: "10" }).setToken(process.env.BOT_TOKEN);
    console.log(
      JSON.stringify(
        await syncBotProfile(
          rest,
          process.env.CLIENTID,
          args.includes("--apply"),
        ),
        null,
        2,
      ),
    );
  } catch {
    // Discord error objects can contain request details. Keep credentials out of logs.
    console.error(
      "Bot profile sync failed. Check application credentials and Discord access.",
    );
    process.exitCode = 1;
  }
}
