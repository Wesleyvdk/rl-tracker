import { test, expect } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

test("all five handlers execute isolated success/error/cache/pagination scenarios without Discord", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "rl-command-tests-"));
  try {
    const child = Bun.spawn([process.execPath, "run", fileURLToPath(new URL("./fixtures/commandHarness.ts", import.meta.url))], {
      cwd,
      env: { PATH: process.env.PATH, HOME: cwd, NODE_ENV: "test" },
      stdout: "pipe", stderr: "pipe",
    });
    const [out, err, code] = await Promise.all([
      new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited,
    ]);
    expect({ code, err }).toEqual({ code: 0, err: "" });
    expect(out).toContain("23 isolated command scenarios passed; no Discord transport");
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});
