import Canvas, { type SKRSContext2D } from "@napi-rs/canvas";
import { fileURLToPath } from "node:url";
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
