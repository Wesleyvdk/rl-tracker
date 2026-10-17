import { test, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { readFileSync } from "node:fs";
import Canvas from "@napi-rs/canvas";
import { AttachmentBuilder } from "discord.js";
import { CardPager } from "../services/cardPager.service";
import {
  ThemeRegistry,
  themeRegistry,
  getTheme,
} from "../services/themeRegistry.service";
import { ThemePreferences } from "../services/themePreferences.service";
import { createCardStyle } from "../services/cardTheme.service";
import generateRank from "../services/generateRankCard.service";
import generateAverage from "../services/generateAverageCard.service";
import generateBoard from "../services/generateLeaderboardCard.service";
import { previewInput } from "../services/themePreview.service";
import {
  makeRankCardModel,
  STANDARD_MODES,
} from "../services/rankCardModel.service";
const catalog = () =>
  JSON.parse(
    readFileSync(new URL("../themes/catalog.json", import.meta.url), "utf8"),
  );
const guild = "123456789012345678",
  otherGuild = "223456789012345678";
const registry = () =>
  new ThemeRegistry(catalog(), {
    version: 1,
    organizations: [{ id: "rsc", guildIds: [guild] }],
  });
function store() {
  const db = new Database(":memory:");
  db.exec(
    "CREATE TABLE users(discord_id TEXT PRIMARY KEY,playername TEXT);INSERT INTO users VALUES ('a','same'),('b','same')",
  );
  return { db, prefs: new ThemePreferences(db, registry()) };
}
test("catalog rejects malformed organization IDs, unsafe assets/colors and duplicate scopes", () => {
  for (const value of [undefined, null, 12, {}, "../rsc"]) {
    const c = catalog();
    c.themes.at(-1).organization = value;
    expect(() => new ThemeRegistry(c)).toThrow();
  }
  for (const key of ["id", "name"]) {
    const c = catalog();
    delete c.themes[0][key];
    expect(() => new ThemeRegistry(c)).toThrow();
  }
  for (const logo of ["https://example.com/a.png", "../../.env", "rsc/a.svg"]) {
    const c = catalog();
    c.themes.at(-1).logo = logo;
    expect(() => new ThemeRegistry(c)).toThrow();
  }
  const c = catalog();
  c.themes[0].colors.accent = "red";
  expect(() => new ThemeRegistry(c)).toThrow();
  expect(
    () =>
      new ThemeRegistry(catalog(), {
        version: 1,
        organizations: [{ guildIds: [guild] }],
      }),
  ).toThrow();
  expect(
    () =>
      new ThemeRegistry(catalog(), {
        version: 1,
        organizations: [{ id: "rsc", guildIds: [guild, guild] }],
      }),
  ).toThrow();
  expect(registry().allowed("rsc", otherGuild)).toBe(false);
  expect(registry().allowed("rsc", guild)).toBe(true);
  expect(themeRegistry.allowed("rsc", guild)).toBe(false);
  expect(getTheme("not-a-theme").id).toBe("slate");
});
test("user/server/default inheritance isolates duplicate links, guilds and organization branding", () => {
  const { db, prefs } = store();
  try {
    expect(prefs.resolve("a", guild)).toBe("slate");
    prefs.setGuild(guild, "jade");
    expect(prefs.resolve("a", guild)).toBe("jade");
    prefs.setUser("a", "dune", guild);
    expect(prefs.resolve("a", guild)).toBe("dune");
    expect(prefs.resolve("b", guild)).toBe("jade");
    expect(prefs.guildTheme(guild)).toBe("jade");
    expect(prefs.guildTheme(otherGuild)).toBe("slate");
    prefs.resetUser("a");
    expect(prefs.resolve("a", guild)).toBe("jade");
    prefs.setUser("a", "rsc", guild);
    expect(prefs.resolve("a", guild)).toBe("rsc");
    expect(prefs.resolve("a", otherGuild)).toBe("slate");
    expect(prefs.resolve("a")).toBe("slate");
    expect(() => prefs.setUser("b", "rsc", otherGuild)).toThrow();
    expect(() => prefs.setUser("missing", "jade")).toThrow();
    db.query(
      "UPDATE account_themes SET theme_id='deleted-theme' WHERE discord_id='a'",
    ).run();
    expect(prefs.resolve("a", guild)).toBe("jade");
    prefs.setGuild(guild);
    expect(prefs.resolve("a", guild)).toBe("slate");
  } finally {
    db.close();
  }
});
test("additive theme setup preserves existing rows, relink retains preference, unlink cascades", () => {
  const { db, prefs } = store();
  try {
    prefs.setUser("a", "dune");
    new ThemePreferences(db, registry());
    expect(db.query("SELECT * FROM users ORDER BY discord_id").all()).toEqual([
      { discord_id: "a", playername: "same" },
      { discord_id: "b", playername: "same" },
    ]);
    db.query("UPDATE users SET playername='new' WHERE discord_id='a'").run();
    expect(prefs.resolve("a")).toBe("dune");
    db.query("DELETE FROM users WHERE discord_id='a'").run();
    expect(db.query("SELECT * FROM account_themes").all()).toEqual([]);
    expect(prefs.resolve("a")).toBe("slate");
    expect(db.query("PRAGMA foreign_key_check").all()).toEqual([]);
  } finally {
    db.close();
  }
});
function luminance(hex: string) {
  const values = hex
    .slice(1)
    .match(/../g)!
    .map((v) => parseInt(v, 16) / 255)
    .map((n) => (n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4));
  return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
}
test("theme text and semantic accents remain readable on panels and table backgrounds", () => {
  for (const theme of themeRegistry.all())
    for (const fg of [
      "text",
      "muted",
      "accent",
      "positive",
      "negative",
      "warning",
    ] as const)
      for (const bg of ["background", "surface", "surfaceAlt"] as const) {
        const a = luminance(theme.colors[fg]),
          b = luminance(theme.colors[bg]);
        expect(
          (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
        ).toBeGreaterThanOrEqual(4.5);
      }
});
test("Tournament occupies fourth position with honest unavailable badge, including zero MMR", () => {
  const input = previewInput("slate");
  input.ranks = input.ranks.filter((r) => r.playlist !== "Tournament Matches");
  const m = makeRankCardModel(input);
  expect(m.modes.map((r) => r.playlist)).toEqual(STANDARD_MODES);
  expect(m.modes).toHaveLength(8);
  const t = m.modes[3];
  expect(t.rank).toBe("Unavailable");
  expect(t.icon).toBe(0);
  expect(t.mmr).toBeNull();
  expect(t.matches).toBeNull();
  const row = {
    ...input.ranks[0],
    playlist: "Tournament Matches",
    mmr: 0,
    rank: "Unranked",
  };
  input.ranks.push(row);
  expect(makeRankCardModel(input).modes[3].mmr).toBe(0);
});
test("concurrent themed render contexts do not leak colors or brand into each other", async () => {
  const a = createCardStyle("dune"),
    b = createCardStyle("jade");
  const ca = Canvas.createCanvas(40, 40),
    cb = Canvas.createCanvas(40, 40);
  a.background(ca.getContext("2d"), 40, 40);
  b.background(cb.getContext("2d"), 40, 40);
  a.background(ca.getContext("2d"), 40, 40);
  const pixel = (c: any) =>
    [...c.getContext("2d").getImageData(0, 0, 1, 1).data].slice(0, 3);
  expect(pixel(ca)).toEqual([238, 229, 214]);
  expect(pixel(cb)).toEqual([24, 46, 40]);
  const inputs = [
    previewInput("slate"),
    previewInput("dune"),
    previewInput("jade"),
    previewInput("rsc"),
  ];
  const images = await Promise.all(inputs.map((i) => generateRank(i)));
  expect(
    new Set(images.map((i) => (i.attachment as Buffer).toString("base64")))
      .size,
  ).toBe(4);
  for (const image of images) {
    const bytes = image.attachment as Buffer;
    expect(bytes.readUInt32BE(16)).toBe(1280);
    expect(bytes.readUInt32BE(20)).toBe(1424);
    expect(bytes.length).toBeLessThan(8 * 1024 * 1024);
  }
});
test("all theme packs render rank, leaderboard and paginated history entirely locally", async () => {
  for (const theme of themeRegistry.all()) {
    const input = previewInput(theme.id),
      stats = input.ranks;
    const seasons = Array.from({ length: 15 }, (_, i) => ({
      season: `S${i + 1}`,
      totalMatches: 42,
      playlists: { "Ranked Duel 1v1": { rank: "Champion I", matches: 42 } },
    }));
    const [rank, board, history] = await Promise.all([
      generateRank(input),
      generateBoard(
        [{ discord_id: "a", playername: "Example", stats_data: stats }],
        "competitive",
        "Preview",
        true,
        theme.id,
      ),
      generateAverage({
        name: "Preview",
        seasonData: seasons,
        theme: theme.id,
        preview: true,
      }),
    ]);
    expect(history).toHaveLength(2);
    for (const image of [rank, ...board, ...history])
      expect((image.attachment as Buffer).subarray(0, 8).toString("hex")).toBe(
        "89504e470d0a1a0a",
      );
  }
});

test("pagination captures one theme per view, including embed accents", async () => {
  const pager = new CardPager(),
    first: any[] = [],
    second: any[] = [];
  const files = () =>
    [0, 1].map(
      (n) =>
        new AttachmentBuilder(Buffer.from("local image"), {
          name: `page-${n}.png`,
        }),
    );
  const command = (id: string, edits: any[]) =>
    ({
      user: { id },
      editReply: async (p: any) => {
        edits.push(p);
        return { id };
      },
    }) as any;
  try {
    let choice = "dune";
    await pager.send(command("a", first), files(), choice);
    choice = "jade";
    await pager.send(command("b", second), files(), choice);
    const click: any = {
      customId: first[0].components[0].toJSON().components[2].custom_id,
      message: { id: "a" },
      user: { id: "a" },
      deferUpdate: async () => {},
      editReply: async (p: any) => {
        first.push(p);
      },
    };
    await pager.handle(click);
    const color = (id: string) =>
      parseInt(getTheme(id).colors.accent.slice(1), 16);
    expect(first[0].embeds[0].toJSON().color).toBe(color("dune"));
    expect(first[1].embeds[0].toJSON().color).toBe(color("dune"));
    expect(second[0].embeds[0].toJSON().color).toBe(color("jade"));
  } finally {
    pager.dispose();
  }
});
