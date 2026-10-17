import Canvas, { type SKRSContext2D } from "@napi-rs/canvas";
import { fileURLToPath } from "node:url";
import { getTheme, type ThemeInput } from "./themeRegistry.service";
import { drawBackgroundArt } from "./backgroundArt.service";
import { readableColor, textInk, rgbLuminance } from "./colorContrast.service";
export { luminance, contrast } from "./colorContrast.service";
export const WIDTH = 1280,
  PAD = 32,
  GAP = 20,
  TILE = 280,
  TOP = 224;
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
  autoContrast = false,
) {
  ctx.font = `${bold ? "bold " : ""}${size}px Inter, "Noto CJK", "Noto Emoji"`;
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
  if (autoContrast && shown) {
    const metrics = ctx.measureText(shown),
      left = Math.max(
        0,
        Math.floor(Math.min(x, x - metrics.actualBoundingBoxLeft)) - 1,
      ),
      top = Math.max(0, Math.floor(y - metrics.actualBoundingBoxAscent) - 1),
      w =
        Math.min(
          ctx.canvas.width,
          Math.ceil(
            x + Math.max(metrics.actualBoundingBoxRight, metrics.width),
          ) + 1,
        ) - left,
      h =
        Math.min(
          ctx.canvas.height,
          Math.ceil(y + metrics.actualBoundingBoxDescent) + 1,
        ) - top;
    if (w > 0 && h > 0) {
      const pixels = ctx.getImageData(left, top, w, h).data;
      let low = Infinity,
        high = -Infinity,
        lo = 0,
        hi = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        const l = rgbLuminance(pixels[i], pixels[i + 1], pixels[i + 2]);
        if (l < low) {
          low = l;
          lo = i;
        }
        if (l > high) {
          high = l;
          hi = i;
        }
      }
      const samples = [
        lo,
        (Math.floor(h / 2) * w + Math.floor(w / 2)) * 4,
        hi,
      ].map(
        (i) =>
          "#" +
          [pixels[i], pixels[i + 1], pixels[i + 2]]
            .map((v) => v.toString(16).padStart(2, "0"))
            .join(""),
      );
      const ink = textInk(color, samples);
      color = ink.color;
      if (ink.backing) {
        ctx.save();
        ctx.fillStyle = ink.backing;
        rounded(ctx, left - 2, top - 2, w + 4, h + 4, 2);
        ctx.fill();
        ctx.restore();
      }
    }
  }
  ctx.fillStyle = color;
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
  ) => text(ctx, value, x, y, size, color, width, bold, true);
  const themedBackground = (
    ctx: SKRSContext2D,
    width: number,
    height: number,
  ) => {
    if (theme.neon) return background(ctx, width, height);
    drawBackgroundArt(ctx, width, height, theme);
  };
  const header = (ctx: SKRSContext2D, width = WIDTH) => {
    // Local masks protect the identity while leaving the material composition visible.
    const mask = ctx.createLinearGradient(0, 0, width, 0);
    mask.addColorStop(0, colors.background + "ef");
    mask.addColorStop(0.44, colors.background + "bc");
    mask.addColorStop(0.78, colors.background + "12");
    mask.addColorStop(1, colors.background + "70");
    ctx.fillStyle = mask;
    ctx.fillRect(0, 0, width, 154);
    ctx.save();
    for (let y = 154; y < 216; y += 2) {
      ctx.globalAlpha = (216 - y) / 62;
      ctx.fillRect(0, y, width, 2);
    }
    ctx.restore();
    ctx.fillStyle = colors.background + "eb";
    rounded(ctx, 1006, 28, 242, 151, theme.radius);
    ctx.fill();
    ctx.fillStyle = colors.accent;
    ctx.fillRect(PAD, 43, 4, 132);
    ctx.strokeStyle = colors.accent + "65";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PAD, 198);
    ctx.lineTo(width - PAD - 80, 198);
    ctx.lineTo(width - PAD - 64, 182);
    ctx.lineTo(width - PAD, 182);
    ctx.stroke();
    // Printer registration marks are decorative framing, not invented data.
    ctx.strokeStyle = colors.accent + "aa";
    for (const x of [PAD, width - PAD]) {
      ctx.beginPath();
      ctx.moveTo(x, 15);
      ctx.lineTo(x, 25);
      ctx.moveTo(x - 5, 20);
      ctx.lineTo(x + 5, 20);
      ctx.stroke();
    }
  };
  const footer = (ctx: SKRSContext2D, height: number, width = WIDTH) => {
    ctx.fillStyle = colors.background + "f5";
    ctx.fillRect(0, height - 58, width, 58);
    ctx.fillStyle = colors.border;
    ctx.fillRect(PAD, height - 58, width - PAD * 2, 1);
  };
  const surface = (
    ctx: SKRSContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    color = colors.accent,
    rank = false,
  ) => {
    ctx.save();
    rounded(ctx, x, y, w, h, theme.radius);
    ctx.clip();
    if (rank && !theme.neon) {
      // The top cap exposes the real canvas artwork; all numbers and plots stay on matte stock.
      const cap = ctx.createLinearGradient(x, y, x + w, y);
      cap.addColorStop(0, colors.surface);
      cap.addColorStop(0.5, colors.surface + "f7");
      cap.addColorStop(0.76, colors.surface + "91");
      cap.addColorStop(1, colors.surface + "18");
      ctx.fillStyle = cap;
      ctx.fillRect(x, y, w, 100);
      ctx.fillStyle = colors.surface;
      ctx.fillRect(x, y + 100, w - 9, h - 100);
      const blend = ctx.createLinearGradient(x, y + 38, x, y + 100);
      blend.addColorStop(0, colors.surface + "00");
      blend.addColorStop(1, colors.surface);
      ctx.fillStyle = blend;
      ctx.fillRect(x, y + 38, w - 9, 62);
      ctx.fillStyle = colors.surface + "95";
      ctx.fillRect(x + w - 9, y + 100, 9, h - 100);
      // Rank-label area is always opaque even when long names reach into the artwork.
      const label = ctx.createLinearGradient(x, y, x + w, y);
      label.addColorStop(0, colors.surface);
      label.addColorStop(0.73, colors.surface);
      label.addColorStop(0.87, colors.surface + "00");
      label.addColorStop(1, colors.surface + "00");
      ctx.fillStyle = label;
      ctx.fillRect(x, y + 45, w, 55);
    } else {
      ctx.fillStyle = colors.surface;
      ctx.fillRect(x, y, w, h);
    }
    const strip = ctx.createLinearGradient(x, y, x + w, y);
    strip.addColorStop(0, color);
    strip.addColorStop(0.45, color + "50");
    strip.addColorStop(1, color + "00");
    ctx.fillStyle = strip;
    ctx.fillRect(x, y, w, 2);
    ctx.restore();
    ctx.strokeStyle = colors.border;
    ctx.lineWidth = 1;
    rounded(ctx, x + 0.5, y + 0.5, w - 1, h - 1, theme.radius);
    ctx.stroke();
    if (theme.backgroundDesign?.style === "circuit") {
      ctx.strokeStyle = colors.accent;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x + w - 27, y + 1);
      ctx.lineTo(x + w - 1, y + 27);
      ctx.moveTo(x + 1, y + h - 20);
      ctx.lineTo(x + 20, y + h - 1);
      ctx.stroke();
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
    surface(ctx, x, y, w, h, color);
    ctx.fillStyle = color;
    ctx.fillRect(x + 1, y + 15, 2, h - 30);
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
    header(ctx);
    themedText(ctx, eyebrow, 51, 65, 15, colors.muted, 900, true);
    themedText(ctx, title, 49, 130, 54, colors.text, 880, true);
    await brand(ctx, 1025, 65, 205, 20);
    themedText(ctx, right, 1025, 109, 19, colors.muted, 205);
  };

  return Object.freeze({
    theme,
    colors,
    text: themedText,
    background: themedBackground,
    header,
    footer,
    surface,
    pill: themedPill,
    panel: themedPanel,
    heading: themedHeading,
    brand,
    // Rank meaning belongs to the data, independently of surrounding branding.
    rankColor: (color: string) => readableRankColor(color, colors.surface),
  });
}

export function readableRankColor(color: string, surface: string) {
  return readableColor(color, surface);
}
