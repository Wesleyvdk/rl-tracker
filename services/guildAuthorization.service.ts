import {
  PermissionsBitField,
  PermissionFlagsBits,
  Routes,
  type Client,
  type APIGuild,
  type APIGuildMember,
  type APIRole,
} from "discord.js";
import type { GuildActor } from "./organizationSettings.service";
/** Fetch uncached REST state, with a shared deadline for roles, membership and ownership. */
export async function guildActor(
  client: Client,
  guildId: string,
  userId: string,
  signal = AbortSignal.timeout(10000),
): Promise<GuildActor> {
  const [guild, roles, member] = await Promise.all([
    client.rest.get(Routes.guild(guildId), { signal }) as Promise<APIGuild>,
    client.rest.get(Routes.guildRoles(guildId), { signal }) as Promise<
      APIRole[]
    >,
    client.rest.get(Routes.guildMember(guildId, userId), {
      signal,
    }) as Promise<APIGuildMember>,
  ]);
  const ids = member.roles;
  const bits = roles
    .filter((r) => r.id === guildId || ids.includes(r.id))
    .reduce((n, r) => n | BigInt(r.permissions), 0n);
  const permissions = new PermissionsBitField(bits);
  return {
    id: userId,
    roles: ids,
    manage:
      guild.owner_id === userId ||
      permissions.has(PermissionFlagsBits.ManageGuild),
  };
}
export async function isBotOperator(client: Client, userId: string) {
  const application = await client.application!.fetch();
  const owner = application.owner;
  return (
    !!owner &&
    ("ownerId" in owner ? owner.ownerId === userId : owner.id === userId)
  );
}
