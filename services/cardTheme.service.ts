import Canvas, { type SKRSContext2D } from "@napi-rs/canvas";
import { fileURLToPath } from "node:url";
import { getTheme, type ThemeInput } from "./themeRegistry.service";
export const WIDTH = 1280,
  PAD = 32,
  GAP = 20,
  TILE = 280,
  TOP = 164;
export const MUTED = "#9dafc5",
  WHITE = "#f3f6ff";
if (
  !Canvas.GlobalFonts.registerFromPath(
    fileURLToPath(
      new URL("../assets/fonts/InterVariable.ttf", import.meta.url),
    ),
    "Inter",
  )
)
  throw new Error("Bundled Inter font could not be loaded");
for (const [file, family] of [
  ["NotoSansCJKjp-Regular.otf", "Noto CJK"],
  ["NotoEmoji.ttf", "Noto Emoji"],
]) {
  if (
    !Canvas.GlobalFonts.registerFromPath(
      fileURLToPath(new URL(`../assets/fonts/${file}`, import.meta.url)),
      family,
    )
  )
    throw new Error(`Bundled font ${family} could not be loaded`);
}
const icons = new Map<
  number,
  Promise<Awaited<ReturnType<typeof Canvas.loadImage>> | null>
>();
export function rounded(
  ctx: SKRSContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r = 16,
) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}
export function text(
  ctx: SKRSContext2D,
  value: string,
  x: number,
  y: number,
  size: number,
  color = WHITE,
  width = 1000,
  bold = false,
) {
  ctx.font = `${bold ? "bold " : ""}${size}px Inter, "Noto CJK", "Noto Emoji"`;
  ctx.fillStyle = color;
  const chars = [
    ...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(
      value,
    ),
  ]
    .slice(0, 200)
    .map((v) => v.segment);
  let shown = chars.join("");
  if (shown !== value || ctx.measureText(shown).width > width) {
    while (chars.length && ctx.measureText(chars.join("") + "…").width > width)
      chars.pop();
    shown = chars.join("") + "…";
  }
  ctx.fillText(shown, x, y);
}
export function pill(
  ctx: SKRSContext2D,
  label: string,
  x: number,
  y: number,
  color: string,
  width: number,
) {
  ctx.fillStyle = color + "18";
  rounded(ctx, x, y, width, 29, 8);
  ctx.fill();
  text(ctx, label, x + 11, y + 20, 15, color, width - 22, true);
}
export function date(at: number) {
  return (
    new Date(at)
      .toLocaleString("en-GB", {
        timeZone: "UTC",
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      })
      .toUpperCase() + " UTC"
  );
}
export function shortDate(at: number) {
  return new Date(at)
    .toLocaleString("en-GB", {
      timeZone: "UTC",
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
    .toUpperCase();
}
export async function icon(index: number) {
  if (!icons.has(index))
    icons.set(
      index,
      Canvas.loadImage(
        fileURLToPath(new URL(`../assets/ranks/${index}.png`, import.meta.url)),
      ).catch(() => null),
    );
  return icons.get(index)!;
}

export function background(ctx: SKRSContext2D, width: number, height: number) {
  const bg = ctx.createLinearGradient(0, 0, width, height);
  bg.addColorStop(0, "#111c30");
  bg.addColorStop(0.5, "#080e19");
  bg.addColorStop(1, "#16152d");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = "#9ca9e208";
  ctx.lineWidth = 1;
  for (let x = -height; x < width; x += 48) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + height, height);
    ctx.stroke();
  }
}
export function panel(
  ctx: SKRSContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color = "#9bb7ff",
) {
  ctx.fillStyle = "#141f30";
  rounded(ctx, x, y, w, h, 16);
  ctx.fill();
  ctx.strokeStyle = color + "35";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = color;
  rounded(ctx, x + 1, y + 14, 3, h - 28, 1.5);
  ctx.fill();
}
export function heading(
  ctx: SKRSContext2D,
  eyebrow: string,
  title: string,
  right: string,
) {
  text(ctx, eyebrow, 36, 40, 15, MUTED, 940, true);
  text(ctx, title, 32, 91, 39, WHITE, 950, true);
  text(ctx, "RL / TRACKER", 1025, 42, 22, WHITE, 223, true);
  text(ctx, right, 1025, 88, 16, MUTED, 223);
}
export function shortMode(name: string) {
  return name.replace(/^Ranked /, "").replace(/ Matches$/, "");
}

const logos = new Map<
  string,
  Promise<Awaited<ReturnType<typeof Canvas.loadImage>>>
>();
/** Immutable rendering context: a concurrent card never changes another card's colors. */
export function createCardStyle(id?: ThemeInput) {
  const theme = getTheme(id),
    colors = theme.colors;
  const themedText = (
    ctx: SKRSContext2D,
    value: string,
    x: number,
    y: number,
    size: number,
    color = colors.text,
    width = 1000,
    bold = false,
  ) => text(ctx, value, x, y, size, color, width, bold);
  const themedBackground = (
    ctx: SKRSContext2D,
    width: number,
    height: number,
  ) => {
    if (theme.neon) return background(ctx, width, height);
    const design = theme.backgroundDesign;
    ctx.fillStyle = colors.background;
    ctx.fillRect(0, 0, width, height);
    if (design && design.style !== "solid") {
      const radians = (design.angle * Math.PI) / 180;
      const dx = (Math.cos(radians) * width) / 2,
        dy = (Math.sin(radians) * height) / 2;
      const gradient = ctx.createLinearGradient(
        width / 2 - dx,
        height / 2 - dy,
        width / 2 + dx,
        height / 2 + dy,
      );
      gradient.addColorStop(0, colors.background);
      gradient.addColorStop(1, design.end);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);
      if (design.style === "aurora") {
        for (const [x, y, radius] of [
          [width * 0.95, height * 0.1, width * 0.8],
          [width * 0.05, height * 0.85, width * 0.65],
        ]) {
          const light = ctx.createRadialGradient(x, y, 0, x, y, radius);
          light.addColorStop(0, colors.accent + "12");
          light.addColorStop(1, colors.accent + "00");
          ctx.fillStyle = light;
          ctx.fillRect(0, 0, width, height);
        }
      }
      if (design.style === "contours") {
        ctx.save();
        ctx.strokeStyle = colors.accent + "0c";
        ctx.lineWidth = 1;
        for (let n = 0; n < 16; n++) {
          ctx.beginPath();
          ctx.ellipse(
            width * 1.08,
            height * -0.12,
            150 + n * 105,
            130 + n * 115,
            0.3,
            0,
            Math.PI * 2,
          );
          ctx.stroke();
        }
        ctx.restore();
      }
    }
  };
  const themedPill = (
    ctx: SKRSContext2D,
    label: string,
    x: number,
    y: number,
    color: string,
    width: number,
  ) => {
    ctx.fillStyle = color + "18";
    rounded(ctx, x, y, width, 29, theme.neon ? 8 : 3);
    ctx.fill();
    themedText(ctx, label, x + 11, y + 20, 15, color, width - 22, true);
  };
  const themedPanel = (
    ctx: SKRSContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    color = colors.accent,
  ) => {
    ctx.fillStyle = colors.surface;
    rounded(ctx, x, y, w, h, theme.radius);
    ctx.fill();
    ctx.strokeStyle = colors.border;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.fillRect(x + 1, y + 1, 3, h - 2);
  };
  const brand = async (
    ctx: SKRSContext2D,
    x: number,
    y: number,
    width: number,
    size = 22,
  ) => {
    let offset = 0;
    if (theme.logo) {
      if (!logos.has(theme.logo))
        logos.set(
          theme.logo,
          Canvas.loadImage(
            fileURLToPath(
              new URL(`../assets/themes/${theme.logo}`, import.meta.url),
            ),
          ),
        );
      const logo = await logos.get(theme.logo)!;
      ctx.drawImage(logo, x, y - size + 2, size, size);
      offset = size + 9;
    }
    themedText(
      ctx,
      theme.brand || "RL / TRACKER",
      x + offset,
      y,
      size,
      colors.text,
      width - offset,
      true,
    );
  };
  const themedHeading = async (
    ctx: SKRSContext2D,
    eyebrow: string,
    title: string,
    right: string,
  ) => {
    themedText(ctx, eyebrow, 36, 40, 15, colors.muted, 940, true);
    themedText(ctx, title, 32, 91, 39, colors.text, 950, true);
    await brand(ctx, 1025, 42, 223);
    themedText(ctx, right, 1025, 88, 16, colors.muted, 223);
  };
  return Object.freeze({
    theme,
    colors,
    text: themedText,
    background: themedBackground,
    pill: themedPill,
    panel: themedPanel,
    heading: themedHeading,
    brand,
    // Rank meaning belongs to the data, independently of surrounding branding.
    rankColor: (color: string) => readableRankColor(color, colors.surface),
  });
}

export function luminance(hex: string) {
  const v = hex
    .slice(1)
    .match(/../g)!
    .map((x) => parseInt(x, 16) / 255)
    .map((x) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return v[0] * 0.2126 + v[1] * 0.7152 + v[2] * 0.0722;
}
export function contrast(a: string, b: string) {
  const x = luminance(a),
    y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
export function readableRankColor(color: string, surface: string) {
  const rgb = color
    .slice(1)
    .match(/../g)!
    .map((x) => parseInt(x, 16));
  const target = luminance(surface) > 0.35 ? 0 : 255;
  for (let n = 0; n <= 20; n++) {
    const adjusted =
      "#" +
      rgb
        .map((x) =>
          Math.round(x + ((target - x) * n) / 20)
            .toString(16)
            .padStart(2, "0"),
        )
        .join("");
    if (contrast(adjusted, surface) >= 4.5) return adjusted;
  }
  return target === 0 ? "#000000" : "#ffffff";
}
