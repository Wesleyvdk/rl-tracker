import { test, expect } from "bun:test";
import { preserveRegistrationSettings } from "../services/commandRegistration.service";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
test("command registration preserves unspecified visibility while source owns content", () => {
  const source = [
    {
      name: "rank",
      description: "New description",
      options: [{ name: "player", type: 3 }],
    },
  ];
  const remote = [
    {
      id: "secretly-readonly",
      application_id: "app",
      version: "old",
      type: 1,
      name: "rank",
      description: "Old description",
      options: [],
      integration_types: [0, 1],
      contexts: [0, 1, 2],
      default_member_permissions: "32",
      dm_permission: true,
      nsfw: false,
    },
  ];
  const before = structuredClone({ source, remote }),
    result = preserveRegistrationSettings(source, remote) as any[];
  expect(result[0]).toEqual({
    ...source[0],
    integration_types: [0, 1],
    contexts: [0, 1, 2],
    default_member_permissions: "32",
    dm_permission: true,
    nsfw: false,
  });
  expect(result[0]).not.toHaveProperty("id");
  expect(result[0]).not.toHaveProperty("version");
  result[0].contexts.push(3);
  expect({ source, remote }).toEqual(before);
});
test("explicit visibility overrides are respected and command types remain separate", () => {
  const source = [
    { name: "rank", type: 1, contexts: [0], default_member_permissions: null },
    { name: "theme", integration_types: [0, 1], contexts: [0, 1, 2] },
  ];
  const result = preserveRegistrationSettings(source, [
    { name: "rank", type: 2, contexts: [1] },
    {
      name: "rank",
      type: 1,
      contexts: [0, 1, 2],
      default_member_permissions: "32",
    },
  ]);
  expect(result[0].contexts).toEqual([0]);
  expect(result[0].default_member_permissions).toBeNull();
  expect(result[1]).toEqual(source[1]);
  expect(preserveRegistrationSettings(source, [])).toEqual(source);
  expect(preserveRegistrationSettings(source, [], false)).toEqual([
    { name: "rank", type: 1, default_member_permissions: null },
    { name: "theme" },
  ]);
  expect(() => preserveRegistrationSettings(source, {})).toThrow();
});
test("deployment fails closed on settings-read failure and preserves settings before writing", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "rl-registration-test-"));
  try {
    const child = Bun.spawn(
      [
        process.execPath,
        "run",
        fileURLToPath(
          new URL("./fixtures/registrationHarness.ts", import.meta.url),
        ),
      ],
      {
        cwd,
        env: {
          PATH: process.env.PATH,
          BOT_TOKEN: "test-token",
          CLIENTID: "test-application",
        },
        stdout: "pipe",
        stderr: "pipe",
      },
    );
    const [out, err, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    expect({ code, err }).toEqual({ code: 0, err: "" });
    expect(out).toContain("Registration transport scenarios passed");
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
