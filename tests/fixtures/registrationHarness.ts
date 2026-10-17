import { mock } from "bun:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
let failed = false,
  calls: any[] = [];
mock.module("discord.js", () => ({
  REST: class {
    setToken() {
      return this;
    }
    async get(route: string) {
      calls.push(["get", route]);
      if (failed) throw Error("Settings read failed");
      return [
        {
          id: "not-writable",
          name: "rank",
          integration_types: [0, 1],
          contexts: [0, 1, 2],
          default_member_permissions: null,
          nsfw: false,
        },
      ];
    }
    async put(route: string, payload: any) {
      calls.push(["put", route, payload]);
      return [];
    }
  },
  Routes: {
    applicationCommands: (id: string) => `commands/${id}`,
    applicationGuildCommands: (id: string, guild: string) =>
      `commands/${id}/${guild}`,
  },
}));
mock.module(
  fileURLToPath(new URL("../../services/commandLoader.ts", import.meta.url)),
  () => ({
    loadCommands: async () => [
      { data: { name: "rank", description: "New source description" } },
      {
        data: { name: "theme", integration_types: [0, 1], contexts: [0, 1, 2] },
      },
    ],
  }),
);
const { deployCommands } = await import("../../deploy");
console.log = () => {};
await deployCommands();
assert.deepEqual(
  calls.map((c) => c[0]),
  ["get", "put"],
);
const body = calls[1][2].body;
assert.deepEqual(body[0].integration_types, [0, 1]);
assert.deepEqual(body[0].contexts, [0, 1, 2]);
assert.equal(body[0].description, "New source description");
assert.equal(body[0].id, undefined);
process.env.TEST_GUILD_ID = "test-guild";
calls = [];
await deployCommands();
assert.equal(calls[1][1], "commands/test-application/test-guild");
assert.equal(calls[1][2].body[0].contexts, undefined);
assert.equal(calls[1][2].body[1].integration_types, undefined);
failed = true;
calls = [];
await assert.rejects(deployCommands(), /Settings read failed/);
assert.deepEqual(
  calls.map((c) => c[0]),
  ["get"],
);
process.stdout.write("Registration transport scenarios passed\n");
