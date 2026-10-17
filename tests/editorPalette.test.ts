import { test, expect } from "bun:test";
import Canvas from "@napi-rs/canvas";
import {
  defaultEditorTheme,
  validateEditorTheme,
  editorCardTheme,
} from "../services/editorTheme.service";
import {
  createCardStyle,
  readableRankColor,
  contrast,
} from "../services/cardTheme.service";
import { textInk } from "../services/colorContrast.service";
import { rankAppearance } from "../services/rankCardModel.service";

test("valid arbitrary color tokens remain unchanged; code and unknown properties still reject", () => {
  for (const patch of [
    {
      background: "#000000",
      surface: "#ffffff",
      surfaceAlt: "#777777",
      text: "#ffffff",
      muted: "#ffffff",
    },
    {
      background: "#ffffff",
      surface: "#000000",
      text: "#000000",
      muted: "#000000",
    },
    { text: "#392c36", muted: "#392c36", accent: "#392c36" },
    {
      background: "#d65226",
      surface: "#309854",
      surfaceAlt: "#954cca",
      text: "#222222",
      muted: "#ecfda3",
    },
  ]) {
    const t = defaultEditorTheme();
    Object.assign(t.colors, patch);
    t.background.end = "#ffffff";
    expect(validateEditorTheme(t)).toEqual(t);
    expect(editorCardTheme(t).colors).toEqual(t.colors);
  }
  for (const patch of [
    { text: "red" },
    { text: "#000000ff" },
    { background: "url(https://example.org/a.png)" },
    { other: "#ffffff" },
  ]) {
    const t = defaultEditorTheme();
    Object.assign(t.colors, patch);
    expect(() => validateEditorTheme(t)).toThrow();
  }
});
test("all reported rank families meet contrast on light, dark and middle grey cards", () => {
  for (const bg of [
    "#000000",
    "#ffffff",
    "#777777",
    "#f3d841",
    "#309854",
    "#954cca",
  ])
    for (const rank of [
      "Bronze I",
      "Silver I",
      "Gold I",
      "Platinum I",
      "Diamond I",
      "Champion I",
      "Grand Champion I",
      "Supersonic Legend",
    ])
      expect(
        contrast(readableRankColor(rankAppearance(rank).color, bg), bg),
      ).toBeGreaterThanOrEqual(4.5);
  expect(readableRankColor("#ffffff", "#777777")).toBe("#000000");
});
test("the production text renderer derives ink for the actual painted zone, not one global palette", () => {
  const t = defaultEditorTheme();
  Object.assign(t.colors, {
    background: "#000000",
    surface: "#ffffff",
    surfaceAlt: "#777777",
    text: "#ffffff",
    muted: "#ffffff",
  });
  const raw = JSON.stringify(t),
    style = createCardStyle(editorCardTheme(t));
  for (const bg of [
    t.colors.background,
    t.colors.surface,
    t.colors.surfaceAlt,
    "#309854",
    "#954cca",
  ])
    for (const fg of [
      t.colors.text,
      t.colors.muted,
      t.colors.positive,
      t.colors.negative,
      t.colors.accent,
    ]) {
      const c = Canvas.createCanvas(300, 80),
        ctx = c.getContext("2d");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, 300, 80);
      style.text(ctx, "MMR 146", 10, 52, 35, fg, 280, true);
      expect(contrast(ctx.fillStyle as string, bg)).toBeGreaterThanOrEqual(4.5);
    }
  expect(JSON.stringify(t)).toBe(raw);
  expect(style.colors).toEqual(t.colors);
  const ink = textInk("#777777", ["#000000", "#ffffff", "#777777"]);
  expect(ink.backing).toBeDefined();
  expect(contrast(ink.color, ink.backing!)).toBeGreaterThanOrEqual(4.5);
});

test("actual glyph bounds protect descenders and a one-pixel highlight between the old sample positions", () => {
  const t = editorCardTheme(defaultEditorTheme()),
    style = createCardStyle(t),
    c = Canvas.createCanvas(650, 130),
    ctx = c.getContext("2d");
  ctx.font = 'bold 54px Inter, "Noto CJK", "Noto Emoji"';
  const value = "gyjpq 🏆",
    x = 16,
    y = 80,
    m = ctx.measureText(value),
    left = Math.floor(x - m.actualBoundingBoxLeft) - 1,
    bottom = Math.ceil(y + m.actualBoundingBoxDescent) + 1;
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, 650, 130);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(left, 0, 1, 130);
  // A second grey region makes every single unbacked ink color unsafe.
  ctx.fillStyle = "#777777";
  ctx.fillRect(120, 0, 180, 130);
  style.text(ctx, value, x, y, 54, "#ffffff", 600, true);
  const p = ctx.getImageData(left, bottom, 1, 1).data;
  expect(p[3]).toBe(255);
  const backing =
    "#" +
    [p[0], p[1], p[2]].map((v) => v.toString(16).padStart(2, "0")).join("");
  expect(backing).not.toBe("#ffffff");
  expect(contrast(ctx.fillStyle as string, backing)).toBeGreaterThanOrEqual(
    4.5,
  );
  expect(m.actualBoundingBoxDescent).toBeGreaterThan(8);
  expect(contrast(ctx.fillStyle as string, "#777777")).toBeGreaterThanOrEqual(
    4.5,
  );
});
