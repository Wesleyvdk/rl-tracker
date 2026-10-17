import { test, expect } from "bun:test";
import Canvas from "@napi-rs/canvas";
import { Database } from "bun:sqlite";
import { readFileSync } from "node:fs";
import {
  BACKGROUND_STYLES,
  validBackground,
} from "../services/backgroundDesign.service";
import {
  drawBackgroundArt,
  backgroundCacheStats,
} from "../services/backgroundArt.service";
import {
  getTheme,
  themeRegistry,
  ThemeRegistry,
} from "../services/themeRegistry.service";
import { createCardStyle } from "../services/cardTheme.service";
import {
  defaultEditorTheme,
  validateEditorTheme,
  editorCardTheme,
} from "../services/editorTheme.service";
import { ThemePreferences } from "../services/themePreferences.service";
import { OrganizationSettings } from "../services/organizationSettings.service";

test("removed Jade preferences fall through inheritance without rewriting stored values", () => {
  const db = new Database(":memory:");
  db.exec(
    "CREATE TABLE users(discord_id TEXT PRIMARY KEY);INSERT INTO users VALUES ('a')",
  );
  const prefs = new ThemePreferences(
    db,
    new ThemeRegistry(
      JSON.parse(
        readFileSync(
          new URL("../themes/catalog.json", import.meta.url),
          "utf8",
        ),
      ),
    ),
  );
  try {
    expect(themeRegistry.all().some((t) => t.id === "jade")).toBe(false);
    expect(themeRegistry.allowed("jade")).toBe(false);
    expect(() => prefs.setUser("a", "jade")).toThrow();
    prefs.setUser("a", "rose");
    prefs.setGuild("123456789012345678", "slate");
    db.query("UPDATE account_themes SET theme_id='jade'").run();
    expect(prefs.resolve("a", "123456789012345678")).toBe("slate");
    db.query("UPDATE guild_themes SET theme_id='jade'").run();
    expect(prefs.resolve("a", "123456789012345678")).toBe("rose");
    expect(
      (db.query("SELECT theme_id FROM account_themes").get() as any).theme_id,
    ).toBe("jade");
    expect(
      (db.query("SELECT theme_id FROM guild_themes").get() as any).theme_id,
    ).toBe("jade");
  } finally {
    db.close();
  }
});
test("background tokens accept original revisions and bounded materials, reject unknown keys and unsafe values", () => {
  for (const style of BACKGROUND_STYLES) {
    const v = defaultEditorTheme();
    v.background = { style, end: "#201d2a", angle: 125 };
    expect(validateEditorTheme(v)).toEqual(v);
    v.background.intensity = 0;
    expect(validateEditorTheme(v)).toEqual(v);
    v.background.intensity = 100;
    expect(validateEditorTheme(v)).toEqual(v);
  }
  for (const patch of [
    { style: "url(https://x)" },
    { end: null },
    { angle: Infinity },
    { intensity: -1 },
    { intensity: 101 },
    { intensity: 3.5 },
    { intensity: "20" },
    { url: "https://x" },
    null,
  ]) {
    const v = defaultEditorTheme();
    v.background =
      patch === null ? (null as any) : ({ ...v.background, ...patch } as any);
    expect(validBackground(v.background)).toBe(false);
    expect(() => validateEditorTheme(v)).toThrow();
  }
  expect(Object.isFrozen(getTheme("chrome").backgroundDesign)).toBe(true);
});
test("materials are deterministic, distinct, bounded in memory and protect all numeric and plot zones", () => {
  const signatures = new Set<string>();
  for (const style of BACKGROUND_STYLES) {
    const theme = editorCardTheme({
      ...defaultEditorTheme(),
      background: { style, end: "#201d2a", angle: 125, intensity: 85 },
    });
    const c = Canvas.createCanvas(320, 370),
      ctx = c.getContext("2d");
    drawBackgroundArt(ctx, 320, 370, theme);
    const png = c.toBuffer("image/png");
    drawBackgroundArt(ctx, 320, 370, theme);
    expect(c.toBuffer("image/png")).toEqual(png);
    signatures.add(png.toString("base64"));
  }
  expect(signatures.size).toBe(BACKGROUND_STYLES.length);
  const style = createCardStyle("chrome");
  const render = (underlay: string) => {
    const c = Canvas.createCanvas(598, 280),
      ctx = c.getContext("2d");
    ctx.fillStyle = underlay;
    ctx.fillRect(0, 0, 598, 280);
    style.surface(ctx, 0, 0, 598, 280, "#b8a2ce", true);
    return ctx.getImageData(24, 100, 550, 154).data;
  };
  expect(render("#ff0000")).toEqual(render("#00ff00"));
  for (let i = 0; i < 24; i++) {
    const t = editorCardTheme({
      ...defaultEditorTheme(),
      background: {
        style: "gradient",
        end: "#201d2a",
        angle: i * 10,
        intensity: 85,
      },
    });
    const c = Canvas.createCanvas(16, 16);
    drawBackgroundArt(c.getContext("2d"), 1280, 5084, t);
  }
  const stats = backgroundCacheStats();
  expect(stats.entries).toBeLessThanOrEqual(8);
  expect(stats.bytes).toBeLessThanOrEqual(8 * 640 * 900 * 4);
});
test("new material revisions and preexisting editor sessions survive reopening without changing original revisions", () => {
  const db = new Database(":memory:");
  db.exec("CREATE TABLE users(discord_id TEXT PRIMARY KEY)");
  const guild = "123456789012345678",
    user = "223456789012345678";
  try {
    new ThemePreferences(
      db,
      new ThemeRegistry(
        JSON.parse(
          readFileSync(
            new URL("../themes/catalog.json", import.meta.url),
            "utf8",
          ),
        ),
      ),
    );
    const store = new OrganizationSettings(db);
    store.apply(guild, user, "Example", "https://example.org");
    store.review(guild, user, "approved");
    const legacy = defaultEditorTheme();
    legacy.background = { style: "aurora", end: "#201d2a", angle: 125 };
    store.save(guild, user, 0, legacy);
    const old = store.publish(guild, user, 1);
    const link = store.issueLink(guild, user);
    const next = defaultEditorTheme();
    next.background.style = "chrome";
    store.save(guild, user, 1, next);
    const id = store.publish(guild, user, 2);
    const reopened = new OrganizationSettings(db);
    expect(reopened.get(old)?.backgroundDesign).toEqual(legacy.background);
    expect(reopened.get(id)?.backgroundDesign?.style).toBe("chrome");
    expect(reopened.link(link.token).guild_id).toBe(guild);
  } finally {
    db.close();
  }
});

test("every artwork-strength slider blends the entire material at zero, half and full strength", () => {
  const render = (style: any, intensity: number) => {
    const t = editorCardTheme({
        ...defaultEditorTheme(),
        background: { style, end: "#201d2a", angle: 125, intensity },
      }),
      c = Canvas.createCanvas(128, 192);
    drawBackgroundArt(c.getContext("2d"), 128, 192, t);
    return c.getContext("2d").getImageData(0, 0, 128, 192).data;
  };
  const baseline = render("gradient", 100);
  for (const style of BACKGROUND_STYLES.filter(
    (v) => !["solid", "gradient"].includes(v),
  )) {
    const zero = render(style, 0),
      half = render(style, 50),
      full = render(style, 100);
    expect(zero).toEqual(baseline);
    let change = 0,
      maxError = 0;
    for (let i = 0; i < zero.length; i++) {
      change += Math.abs(full[i] - zero[i]);
      maxError = Math.max(
        maxError,
        Math.abs(half[i] - (zero[i] + full[i]) / 2),
      );
    }
    expect(change).toBeGreaterThan(1000);
    expect(maxError).toBeLessThanOrEqual(1.5);
  }
});
