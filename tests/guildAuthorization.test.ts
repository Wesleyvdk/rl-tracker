import { test, expect } from "bun:test";
import { PermissionFlagsBits } from "discord.js";
import {
  guildActor,
  isBotOperator,
} from "../services/guildAuthorization.service";
const guild = "123456789012345678",
  user = "223456789012345678",
  role = "323456789012345678";
test("authorization reads current owner, roles and membership with one cancellable REST deadline", async () => {
  const calls: any[] = [];
  let owner = user,
    bits = 0n;
  const client: any = {
    rest: {
      get: async (route: string, options: any) => {
        calls.push({ route, options });
        if (route.endsWith("/members/" + user)) return { roles: [role] };
        if (route.endsWith("/roles"))
          return [
            { id: guild, permissions: "0" },
            { id: role, permissions: String(bits) },
          ];
        return { owner_id: owner };
      },
    },
  };
  expect((await guildActor(client, guild, user)).manage).toBe(true);
  owner = "other";
  expect((await guildActor(client, guild, user)).manage).toBe(false);
  bits = PermissionFlagsBits.ManageGuild;
  expect((await guildActor(client, guild, user)).manage).toBe(true);
  bits = PermissionFlagsBits.Administrator;
  expect((await guildActor(client, guild, user)).manage).toBe(true);
  expect(calls).toHaveLength(12);
  for (const c of calls) expect(c.options.signal).toBeInstanceOf(AbortSignal);
  for (let n = 0; n < 12; n += 3)
    expect(calls[n].options.signal).toBe(calls[n + 2].options.signal);
});
test("organization admission recognizes only verified application owner or team owner", async () => {
  const client = (owner: any) =>
    ({ application: { fetch: async () => ({ owner }) } }) as any;
  expect(await isBotOperator(client({ id: user }), user)).toBe(true);
  expect(await isBotOperator(client({ id: "other" }), user)).toBe(false);
  expect(await isBotOperator(client({ id: "team", ownerId: user }), user)).toBe(
    true,
  );
  expect(
    await isBotOperator(client({ id: user, ownerId: "other" }), user),
  ).toBe(false);
});
