import Canvas from "@napi-rs/canvas";
import { writeFileSync } from "node:fs";
import { drawBackgroundArt } from "../services/backgroundArt.service";
import { BACKGROUND_STYLES } from "../services/backgroundDesign.service";
import { getTheme, themeRegistry } from "../services/themeRegistry.service";
for (const style of BACKGROUND_STYLES) {
  const base =
    themeRegistry.all().find((t) => t.backgroundDesign?.style === style) ||
    getTheme("rose");
  const theme = {
    ...base,
    backgroundDesign: {
      style,
      end: base.backgroundDesign?.end || "#201d2a",
      angle: 125,
      intensity: 100,
    },
  };
  const c = Canvas.createCanvas(256, 128);
  drawBackgroundArt(c.getContext("2d"), 256, 128, theme);
  writeFileSync(
    `assets/backgrounds/${style}.webp`,
    c.toBuffer("image/webp", 90),
  );
}
