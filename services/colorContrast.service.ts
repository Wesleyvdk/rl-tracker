const linear = Array.from({ length: 256 }, (_, n) => {
  const x = n / 255;
  return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
});
export function rgbLuminance(r: number, g: number, b: number) {
  return linear[r] * 0.2126 + linear[g] * 0.7152 + linear[b] * 0.0722;
}
export function luminance(hex: string) {
  const v = hex
    .slice(1)
    .match(/../g)!
    .map((x) => parseInt(x, 16));
  return rgbLuminance(v[0], v[1], v[2]);
}
export function contrast(a: string, b: string) {
  const x = luminance(a),
    y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
function blend(color: string, target: string, f: number) {
  const a = color
      .slice(1)
      .match(/../g)!
      .map((x) => parseInt(x, 16)),
    b = target === "#ffffff" ? 255 : 0;
  return (
    "#" +
    a
      .map((x) =>
        Math.round(x + (b - x) * f)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}
/** Keep the requested hue when possible; choose the endpoint by actual contrast. */
export function readableColor(color: string, surface: string) {
  if (contrast(color, surface) >= 4.5) return color;
  const target =
    contrast("#000000", surface) >= contrast("#ffffff", surface)
      ? "#000000"
      : "#ffffff";
  for (let n = 1; n <= 32; n++) {
    const candidate = blend(color, target, n / 32);
    if (contrast(candidate, surface) >= 4.5) return candidate;
  }
  return target;
}
/** Ink is derived from pixels already painted, never written into saved design tokens. */
export function textInk(color: string, samples: string[]) {
  const backgrounds = [...new Set(samples)];
  const low = Math.min(...backgrounds.map(luminance)),
    high = Math.max(...backgrounds.map(luminance));
  const readable = (c: string) => {
    const l = luminance(c);
    // Cover the whole observed luminance interval, including narrow highlights
    // and intermediate tones, rather than assuming three endpoint samples suffice.
    return (
      !(l > low && l < high) &&
      backgrounds.every((bg) => contrast(c, bg) >= 4.5)
    );
  };
  if (readable(color)) return { color };
  const channels = color
    .slice(1)
    .match(/../g)!
    .map((x) => parseInt(x, 16));
  if (Math.max(...channels) - Math.min(...channels) < 8) {
    const endpoints = ["#000000", "#ffffff"].filter(readable);
    if (endpoints.length)
      return {
        color: endpoints.sort(
          (a, b) =>
            Math.min(...backgrounds.map((bg) => contrast(b, bg))) -
            Math.min(...backgrounds.map((bg) => contrast(a, bg))),
        )[0],
      };
  }
  for (let n = 1; n <= 32; n++)
    for (const endpoint of ["#000000", "#ffffff"]) {
      const candidate = blend(color, endpoint, n / 32);
      if (readable(candidate)) return { color: candidate };
    }
  // A single line may cross both light and dark artwork. Give just that line a
  // local opaque backing; changing one global foreground cannot make it readable.
  const backing = samples[Math.floor(samples.length / 2)];
  return { color: readableColor(color, backing), backing };
}
