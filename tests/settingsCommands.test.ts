import { test, expect } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
test("settings, organization admission and editor commands enforce permissions in isolated handlers", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "rl-settings-"));
  try {
    const child = Bun.spawn(
      [
        process.execPath,
        "run",
        fileURLToPath(
          new URL("./fixtures/settingsHarness.ts", import.meta.url),
        ),
      ],
      {
        cwd,
        env: { PATH: process.env.PATH, HOME: cwd, NODE_ENV: "test" },
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
    expect(out).toContain("settings and organization command scenarios passed");
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
