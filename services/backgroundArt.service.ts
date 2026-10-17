import Canvas, {
  type Canvas as CanvasLayer,
  type SKRSContext2D,
} from "@napi-rs/canvas";
import type { CardTheme } from "./themeRegistry.service";

// Original procedural artwork. No downloaded artwork, remote fonts or image services.
// Reduced-resolution layers are reusable across all three renderers; at most 8 x 640 x 900 RGBA.
const layers = new Map<string, CanvasLayer>();
const MAX_LAYERS = 8;
function random(seed = 7719) {
  return () => {
    seed = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    seed ^= seed + Math.imul(seed ^ (seed >>> 7), 61 | seed);
    return ((seed ^ (seed >>> 14)) >>> 0) / 4294967296;
  };
}
const rgb = (hex: string) =>
  hex
    .slice(1)
    .match(/../g)!
    .map((v) => parseInt(v, 16));
export function mix(a: string, b: string, f: number) {
  const aa = rgb(a),
    bb = rgb(b);
  return (
    "#" +
    aa
      .map((v, i) =>
        Math.round(v + (bb[i] - v) * Math.min(1, Math.max(0, f)))
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}
function glow(
  c: SKRSContext2D,
  x: number,
  y: number,
  r: number,
  color: string,
  opacity: number,
) {
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(
    0,
    color +
      Math.round(opacity * 255)
        .toString(16)
        .padStart(2, "0"),
  );
  g.addColorStop(1, color + "00");
  c.fillStyle = g;
  c.fillRect(x - r, y - r, r * 2, r * 2);
}
function line(c: SKRSContext2D, pts: number[][]) {
  c.beginPath();
  pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
  c.stroke();
}

function material(
  c: SKRSContext2D,
  w: number,
  h: number,
  t: Readonly<CardTheme>,
  chrome: boolean,
) {
  const b = rgb(t.colors.background),
    a = rgb(t.colors.accent),
    e = rgb(t.backgroundDesign!.end),
    data = c.createImageData(w, h),
    power = 1;
  const angle = (t.backgroundDesign!.angle * Math.PI) / 180,
    cs = Math.cos(angle),
    sn = Math.sin(angle);
  // Height-field normals reflect a studio environment, rather than painting blurred stripes.
  const height = (u: number, v: number) => {
    const x = u + 0.29 * Math.sin(v * 1.7) + 0.12 * Math.sin(u * 3.1 - v * 0.7),
      y = v + 0.3 * Math.sin(u * 1.8);
    return (
      0.23 * Math.sin(x * 5.2 + Math.sin(y * 2.7)) +
      0.13 * Math.cos(y * 4.4 + x * 2.1) +
      0.045 * Math.sin(x * 13.2 - y * 6.1)
    );
  };
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const U = (x / w) * 2.8,
        V = (y / w) * 2.8,
        u = U * cs - V * sn,
        v = U * sn + V * cs,
        eps = 0.004;
      let nx = -(height(u + eps, v) - height(u - eps, v)) / (2 * eps),
        ny = -(height(u, v + eps) - height(u, v - eps)) / (2 * eps),
        nz = 1;
      const length = Math.hypot(nx, ny, nz);
      nx /= length;
      ny /= length;
      nz /= length;
      const rx = 2 * nx * nz,
        ry = 2 * ny * nz,
        rz = 2 * nz * nz - 1;
      const broad = Math.exp(-Math.pow((rx * 0.7 + ry * 0.4 - 0.05) / 0.36, 2));
      const softbox = Math.exp(
        -Math.pow((rx * 0.83 - ry * 0.55 + 0.21) / 0.073, 2),
      );
      const rim = Math.exp(-Math.pow((rx + ry * 0.13 - 0.64) / 0.019, 2));
      const negative = Math.exp(
        -Math.pow((rx * 0.6 + ry * 0.8 + 0.35) / 0.09, 2),
      );
      const ambient = 0.13 + (0.2 * (rz + 1)) / 2,
        shadow = 0.55 + 0.45 * nz;
      const i = (y * w + x) * 4;
      for (let k = 0; k < 3; k++) {
        const tint = chrome
          ? [
              137 + 46 * Math.sin(u * 0.8 + v * 0.3),
              159 + 28 * rx,
              204 - 34 * ry,
            ][k]
          : a[k];
        const steel = chrome
          ? (ambient * tint +
              broad * 50 +
              softbox * 180 +
              rim * 180 -
              negative * 55) *
            shadow
          : b[k] * 0.8 +
            e[k] * 0.2 +
            broad * 19 +
            softbox * 39 +
            rim * 10 -
            negative * 5;
        const grain = (((x * 1973 + y * 9277) ^ ((x + y) * 26699)) & 7) - 3;
        const base = b[k] * 0.8 + e[k] * 0.2;
        data.data[i + k] = Math.max(
          0,
          Math.min(
            255,
            base + (steel - base) * power + grain * (chrome ? 0.55 : 0.22),
          ),
        );
      }
      data.data[i + 3] = 255;
    }
  c.putImageData(data, 0, 0);
}

function circuit(
  c: SKRSContext2D,
  w: number,
  h: number,
  t: Readonly<CardTheme>,
) {
  const a = t.colors.accent,
    rand = random(429),
    unit = w / 16;
  c.lineWidth = 0.65;
  c.strokeStyle = a + "20";
  for (let x = 0; x < w; x += unit)
    line(c, [
      [x, 0],
      [x, h],
    ]);
  for (let y = 0; y < h; y += unit)
    line(c, [
      [0, y],
      [w, y],
    ]);
  // Three engineering modules connected by parallel routed busses.
  for (const [cx, cy, size] of [
    [w * 0.68, w * 0.08, w * 0.15],
    [w * 0.2, h * 0.43, w * 0.1],
    [w * 0.75, h * 0.77, w * 0.13],
  ]) {
    c.strokeStyle = a + "b0";
    c.lineWidth = 1;
    c.strokeRect(cx - size / 2, cy - size / 2, size, size);
    c.strokeStyle = a + "45";
    c.strokeRect(cx - size * 0.38, cy - size * 0.38, size * 0.76, size * 0.76);
    for (let pin = 0; pin < 12; pin++) {
      const q = ((pin + 0.5) / 12) * size - size / 2;
      c.lineWidth = 0.7;
      line(c, [
        [cx + q, cy - size / 2],
        [cx + q, cy - size * 0.69],
      ]);
      line(c, [
        [cx + q, cy + size / 2],
        [cx + q, cy + size * 0.69],
      ]);
      line(c, [
        [cx - size / 2, cy + q],
        [cx - size * 0.69, cy + q],
      ]);
      line(c, [
        [cx + size / 2, cy + q],
        [cx + size * 0.69, cy + q],
      ]);
    }
    c.fillStyle = a + "25";
    c.fillRect(cx - size * 0.24, cy - size * 0.24, size * 0.48, size * 0.48);
    // Crosshatched heat-sink inset.
    for (let i = 0; i < 8; i++)
      line(c, [
        [cx - size * 0.2, cy - size * 0.2 + i * size * 0.055],
        [cx + size * 0.2, cy - size * 0.2 + i * size * 0.055],
      ]);
  }
  for (let i = 0; i < 12; i++) {
    const offset = i * w * 0.008;
    c.strokeStyle = a + (i % 3 ? "65" : "c0");
    c.lineWidth = i % 3 ? 0.6 : 1;
    line(c, [
      [w * 0.03 + offset, 0],
      [w * 0.03 + offset, w * 0.18],
      [w * 0.25 + offset, w * 0.4],
      [w * 0.25 + offset, h * 0.44],
      [w * 0.49 + offset, h * 0.44 + w * 0.24],
      [w + 10, h * 0.44 + w * 0.24],
    ]);
    line(c, [
      [0, h * 0.72 + offset],
      [w * 0.24, h * 0.72 + offset],
      [w * 0.38, h * 0.58 + offset],
      [w * 0.7, h * 0.58 + offset],
      [w * 0.88, h * 0.76 + offset],
      [w * 0.88, h + 10],
    ]);
  }
  // Sparse connector nodes and dashed construction lines define a second line-weight hierarchy.
  c.setLineDash([3, 5]);
  c.strokeStyle = a + "50";
  c.lineWidth = 0.6;
  line(c, [
    [0, w * 0.33],
    [w, w * 0.33],
  ]);
  line(c, [
    [w * 0.56, 0],
    [w * 0.56, h],
  ]);
  c.setLineDash([]);
  for (const [x, y, r] of [
    [w * 0.79, w * 0.12, w * 0.18],
    [w * 0.13, h * 0.58, w * 0.18],
    [w * 0.91, h * 0.88, w * 0.23],
  ]) {
    c.strokeStyle = a + "95";
    c.lineWidth = 0.85;
    for (const factor of [0.5, 0.72, 0.9, 1]) {
      c.beginPath();
      c.arc(x, y, r * factor, 0.24, Math.PI * 1.92);
      c.stroke();
    }
    for (let i = 0; i < 48; i++) {
      const q = (i * Math.PI) / 24;
      line(c, [
        [x + Math.cos(q) * r * 1.03, y + Math.sin(q) * r * 1.03],
        [x + Math.cos(q) * r * 1.08, y + Math.sin(q) * r * 1.08],
      ]);
    }
    line(c, [
      [x - r * 1.25, y],
      [x + r * 1.25, y],
    ]);
    line(c, [
      [x, y - r * 1.25],
      [x, y + r * 1.25],
    ]);
    c.strokeRect(x - r * 0.34, y - r * 0.34, r * 0.68, r * 0.68);
  }
  // Broad cropped industrial stripe makes this a composition, not a tiny repeated texture.
  c.save();
  c.translate(w * 0.89, 0);
  c.rotate(0.36);
  c.fillStyle = a + "25";
  c.fillRect(0, -w, w * 0.1, h * 1.8);
  c.strokeStyle = a + "90";
  c.lineWidth = 2;
  line(c, [
    [0, -w],
    [0, h * 1.8],
  ]);
  c.restore();
}

function facets(
  c: SKRSContext2D,
  w: number,
  h: number,
  t: Readonly<CardTheme>,
  frost: boolean,
) {
  const rand = random(frost ? 117 : 559);
  if (frost) {
    // Long overlapping glass plates, frost granules and branching fractures: no triangle tessellation.
    glow(c, w * 0.82, w * 0.18, w * 0.6, t.colors.accent, 0.65);
    for (let n = 0; n < 18; n++) {
      const x = w * (0.12 + rand()),
        y = -w * 0.2 + rand() * h,
        span = w * (0.05 + rand() * 0.17),
        length = w * (0.5 + rand() * 0.6);
      const pts = [
        [x, y],
        [x + span, y - w * 0.14],
        [x + span - w * 0.2, y + length],
        [x - w * 0.17, y + length + w * 0.09],
      ];
      const g = c.createLinearGradient(x, y, x + span, y + length);
      g.addColorStop(0, t.colors.accent + "10");
      g.addColorStop(0.48, t.colors.accent + "35");
      g.addColorStop(0.51, t.colors.text + "50");
      g.addColorStop(0.54, t.colors.accent + "0a");
      g.addColorStop(1, t.colors.accent + "02");
      c.beginPath();
      pts.forEach(([px, py], i) => (i ? c.lineTo(px, py) : c.moveTo(px, py)));
      c.closePath();
      c.fillStyle = g;
      c.fill();
      c.strokeStyle = t.colors.accent + "50";
      c.lineWidth = 0.55;
      c.stroke();
      c.strokeStyle = t.colors.text + "65";
      line(c, [
        [x, y],
        [x - w * 0.17, y + length + w * 0.09],
      ]);
      for (let j = 0; j < 6; j++) {
        const v = j / 6,
          xx = x - w * 0.17 * v,
          yy = y + (length + w * 0.09) * v;
        c.strokeStyle = t.colors.accent + "35";
        line(c, [
          [xx, yy],
          [xx + span * 0.6, yy + span * 0.25],
          [xx + span * 0.8, yy + span * 0.8],
        ]);
      }
    }
    const fx = w * 0.76,
      fy = w * 0.16;
    for (let ray = 0; ray < 19; ray++) {
      const a = (ray / 19) * Math.PI * 2,
        len = w * (0.25 + rand() * 0.75),
        pts = [[fx, fy]];
      for (let j = 1; j <= 7; j++) {
        const d = (j / 7) * len,
          xx = fx + Math.cos(a) * d + (rand() - 0.5) * w * 0.025,
          yy = fy + Math.sin(a) * d + (rand() - 0.5) * w * 0.025;
        pts.push([xx, yy]);
        if (j % 2 === 0) {
          c.strokeStyle = t.colors.accent + "50";
          c.lineWidth = 0.5;
          line(c, [
            [xx, yy],
            [
              xx + Math.cos(a + 0.5) * len * 0.18,
              yy + Math.sin(a + 0.5) * len * 0.18,
            ],
          ]);
        }
      }
      c.strokeStyle = t.colors.text + (ray % 3 ? "65" : "b0");
      c.lineWidth = ray % 3 ? 0.45 : 1;
      line(c, pts);
    }
    for (let i = 0; i < 8500; i++) {
      c.fillStyle = t.colors.text + (i % 5 ? "10" : "27");
      c.fillRect(rand() * w, rand() * h, 0.5 + rand(), 0.5 + rand());
    }
    return;
  }
  // An asymmetric crystal formation: small bevels, long shards and prismatic light, not flat wallpaper.
  for (let n = 0; n < 85; n++) {
    const y = -w * 0.1 + rand() * (h + w * 0.2),
      center = w * (0.7 + 0.2 * Math.sin((y / w) * 3)),
      x = center + (rand() - 0.5) * w * 0.6;
    const length = w * (0.06 + rand() * 0.35),
      breadth = w * (0.015 + rand() * 0.09),
      lean = w * (0.01 + rand() * 0.17);
    const top = [x, y - length * 0.5],
      left = [x - breadth, y + length * 0.25],
      bottom = [x - lean, y + length * 0.5],
      right = [x + breadth * 0.6, y - length * 0.12],
      core = [x - breadth * 0.12, y];
    const tint =
      n % 3 === 0 ? "#9cd0dd" : n % 3 === 1 ? t.colors.accent : "#d3adcc";
    const planes = [
      [top, left, core],
      [left, bottom, core],
      [bottom, right, core],
      [right, top, core],
    ];
    planes.forEach((pts, j) => {
      const g = c.createLinearGradient(
        pts[0][0],
        pts[0][1],
        core[0] + 2,
        core[1] + 2,
      );
      g.addColorStop(
        0,
        mix(t.colors.background, tint, [0.2, 0.65, 0.11, 0.8][j]),
      );
      g.addColorStop(
        1,
        mix(t.colors.background, tint, [0.6, 0.24, 0.5, 0.16][j]),
      );
      c.beginPath();
      pts.forEach(([px, py], i) => (i ? c.lineTo(px, py) : c.moveTo(px, py)));
      c.closePath();
      c.fillStyle = g;
      c.fill();
      c.lineWidth = 0.45;
      c.strokeStyle = tint + "70";
      c.stroke();
    });
    if (n % 3 === 0) {
      c.strokeStyle = t.colors.text + "b0";
      c.lineWidth = 0.7;
      line(c, [top, core, bottom]);
    }
  }
}

function contours(
  c: SKRSContext2D,
  w: number,
  h: number,
  t: Readonly<CardTheme>,
) {
  // Stream surfaces fold around multiple organic ridges with varying separation and lighting.
  for (let n = -35; n < 145; n++) {
    const f = n / 100;
    c.beginPath();
    for (let i = 0; i <= 240; i++) {
      const u = i / 240,
        warp = u + 0.12 * Math.sin(f * 4 + u * 2),
        base = f * h * 0.9;
      const y =
        base +
        Math.sin(warp * 6.6 + f * 0.95) * w * 0.16 +
        Math.sin(warp * 13.2 - f * 1.7) * w * 0.045 +
        Math.exp(-Math.pow((warp - 0.65) / 0.22, 2)) *
          Math.sin(f * 4.2) *
          w *
          0.23;
      const x = u * w;
      i ? c.lineTo(x, y) : c.moveTo(x, y);
    }
    const light = (Math.sin(f * 8) + 1) / 2;
    c.strokeStyle =
      mix(t.colors.accent, t.colors.text, light * 0.72) +
      (n % 7 === 0 ? "ca" : "75");
    c.lineWidth = n % 7 === 0 ? 0.85 : 0.5;
    c.stroke();
  }
}
function hashNoise(x: number, y: number) {
  let n = Math.imul(x, 374761393) + Math.imul(y, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}
function noise(x: number, y: number) {
  const ix = Math.floor(x),
    iy = Math.floor(y),
    fx = x - ix,
    fy = y - iy,
    u = fx * fx * (3 - 2 * fx),
    v = fy * fy * (3 - 2 * fy);
  return (
    (hashNoise(ix, iy) * (1 - u) + hashNoise(ix + 1, iy) * u) * (1 - v) +
    (hashNoise(ix, iy + 1) * (1 - u) + hashNoise(ix + 1, iy + 1) * u) * v
  );
}
function fbm(x: number, y: number) {
  let value = 0,
    amp = 0.55;
  for (let i = 0; i < 5; i++) {
    value += noise(x, y) * amp;
    x = x * 2.03 + 13.1;
    y = y * 2.03 - 7.9;
    amp *= 0.5;
  }
  return value;
}

function cosmos(
  c: SKRSContext2D,
  w: number,
  h: number,
  t: Readonly<CardTheme>,
) {
  const rand = random(923),
    img = c.getImageData(0, 0, w, h),
    base = rgb(t.colors.background),
    accent = rgb(t.colors.accent);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const u = x / w,
        v = y / h,
        f = fbm(u * 4.6 + 12, v * 5.8 + 4),
        f2 = fbm(u * 7 + f * 2, v * 8 - f * 1.5);
      const axis = v - (0.1 + u * 0.7 + 0.12 * Math.sin(u * 7)),
        band = Math.exp(-Math.pow(axis / 0.2, 2));
      const cloud = Math.pow(Math.max(0, (f - 0.25) * 1.9), 1.6) * band,
        filament =
          Math.pow(Math.max(0, 1 - Math.abs(f2 - 0.48) * 6), 4) * band * cloud;
      const i = (y * w + x) * 4;
      for (let k = 0; k < 3; k++)
        img.data[i + k] = Math.min(
          255,
          base[k] +
            cloud * ([68, 34, 83][k] + accent[k] * 0.23) +
            filament * [105, 75, 85][k],
        );
    }
  c.putImageData(img, 0, 0);
  c.fillStyle = t.colors.accent + "35";
  for (let x = w * 0.45; x < w; x += 5)
    for (let y = 0; y < h * 0.3; y += 5)
      if (rand() > 0.2) {
        c.beginPath();
        c.arc(x, y, 0.6, 0, 7);
        c.fill();
      }
  for (let i = 0; i < 350; i++) {
    const x = rand() * w,
      y = rand() * h,
      r = rand() > 0.95 ? 1.2 : 0.5;
    c.fillStyle = t.colors.text + (i % 4 ? "60" : "cc");
    c.beginPath();
    c.arc(x, y, r, 0, 7);
    c.fill();
    if (i % 57 === 0) {
      c.strokeStyle = t.colors.text + "b0";
      c.lineWidth = 0.7;
      line(c, [
        [x - 4, y],
        [x + 4, y],
      ]);
      line(c, [
        [x, y - 6],
        [x, y + 6],
      ]);
    }
  }
  const x = w * 0.72,
    y = w * 0.16,
    r = w * 0.12,
    g = c.createRadialGradient(x - r * 0.45, y - r * 0.5, 0, x, y, r);
  g.addColorStop(0, mix(t.colors.accent, t.colors.text, 0.4));
  g.addColorStop(0.55, mix(t.colors.accent, t.colors.background, 0.55));
  g.addColorStop(1, t.colors.background);
  c.fillStyle = g;
  c.beginPath();
  c.arc(x, y, r, 0, 7);
  c.fill();
  c.strokeStyle = t.colors.accent + "70";
  c.lineWidth = 0.8;
  c.stroke();
  c.beginPath();
  c.ellipse(x, y, r * 1.65, r * 0.22, -0.4, 0, Math.PI * 2);
  c.stroke();
}

export function drawBackgroundArt(
  ctx: SKRSContext2D,
  width: number,
  height: number,
  theme: Readonly<CardTheme>,
) {
  const design = theme.backgroundDesign;
  const w = Math.min(640, width),
    h = Math.min(900, Math.ceil(w * 1.5));
  const key = JSON.stringify([
    w,
    h,
    theme.colors.background,
    theme.colors.accent,
    theme.colors.text,
    design,
  ]);
  let layer = layers.get(key);
  if (layer) {
    layers.delete(key);
    layers.set(key, layer);
  } else {
    layer = Canvas.createCanvas(w, h);
    const c = layer.getContext("2d");
    c.fillStyle = theme.colors.background;
    c.fillRect(0, 0, w, h);
    if (design && design.style !== "solid") {
      const a = (design.angle * Math.PI) / 180,
        dx = (Math.cos(a) * w) / 2,
        dy = (Math.sin(a) * h) / 2;
      const g = c.createLinearGradient(
        w / 2 - dx,
        h / 2 - dy,
        w / 2 + dx,
        h / 2 + dy,
      );
      g.addColorStop(0, theme.colors.background);
      g.addColorStop(1, design.end);
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);
      // putImageData deliberately ignores globalAlpha. Render material at full strength
      // in a temporary layer, then blend the whole artwork once, including cloud pixels.
      const art = Canvas.createCanvas(w, h),
        ac = art.getContext("2d");
      ac.drawImage(layer, 0, 0);
      if (design.style === "chrome" || design.style === "satin") {
        material(ac, w, h, theme, design.style === "chrome");
      }
      if (design.style === "circuit") circuit(ac, w, h, theme);
      if (design.style === "prism" || design.style === "frost")
        facets(ac, w, h, theme, design.style === "frost");
      if (design.style === "contours") contours(ac, w, h, theme);
      if (design.style === "orbit") cosmos(ac, w, h, theme);
      if (design.style === "aurora") {
        glow(ac, w * 0.85, h * 0.1, w * 0.7, theme.colors.accent, 0.5);
        glow(ac, w * 0.1, h * 0.8, w * 0.6, theme.colors.accent, 0.3);
      }
      c.save();
      c.globalAlpha = (design.intensity ?? 70) / 100;
      c.drawImage(art, 0, 0);
      c.restore();
    }
    if (layers.size >= MAX_LAYERS) layers.delete(layers.keys().next().value!);
    layers.set(key, layer);
  }
  ctx.drawImage(
    layer,
    0,
    0,
    w,
    Math.min(h, (height / width) * w),
    0,
    0,
    width,
    height,
  );
}
export function backgroundCacheStats() {
  return {
    entries: layers.size,
    maxEntries: MAX_LAYERS,
    bytes: [...layers.values()].reduce((n, c) => n + c.width * c.height * 4, 0),
  };
}
