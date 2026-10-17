import { EditorInputError } from "./editorErrors.service";
import {
  getTheme,
  type CardTheme,
  type ThemeColors,
} from "./themeRegistry.service";
import { contrast } from "./cardTheme.service";
import {
  validBackground,
  type BackgroundDesign,
} from "./backgroundDesign.service";
export const EDITOR_COLORS = [
  "background",
  "surface",
  "surfaceAlt",
  "text",
  "muted",
  "border",
  "accent",
  "positive",
  "negative",
  "warning",
] as const;
export interface EditorTheme {
  name: string;
  brand: string;
  base: "rose" | "slate";
  radius: number;
  colors: ThemeColors;
  background: BackgroundDesign;
}
function keys(value: any, allowed: readonly string[]) {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).every((k) => allowed.includes(k))
  );
}
function label(value: unknown, max: number) {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= max &&
    !/[\p{Cc}\p{Cf}<>]/u.test(value)
  );
}
export function defaultEditorTheme(): EditorTheme {
  const t = getTheme("rose");
  return {
    name: "Organization",
    brand: "ORG / TRACKER",
    base: "rose",
    radius: 8,
    colors: { ...t.colors },
    background: { style: "satin", end: "#201d2a", angle: 125, intensity: 70 },
  };
}
export function validateEditorTheme(value: unknown): EditorTheme {
  const v = value as EditorTheme;
  if (
    !keys(v, ["name", "brand", "base", "radius", "colors", "background"]) ||
    !label(v.name, 40) ||
    !label(v.brand, 22) ||
    !["rose", "slate"].includes(v.base) ||
    !Number.isInteger(v.radius) ||
    v.radius < 0 ||
    v.radius > 20 ||
    !keys(v.colors, EDITOR_COLORS) ||
    !EDITOR_COLORS.every(
      (k) =>
        typeof v.colors[k] === "string" && /^#[0-9a-f]{6}$/i.test(v.colors[k]),
    ) ||
    !validBackground(v.background)
  )
    throw new EditorInputError(
      "Use a name, a brand label, valid colors and a supported background.",
    );
  for (const fg of [
    "text",
    "muted",
    "accent",
    "positive",
    "negative",
    "warning",
  ] as const) {
    for (const bg of [
      ...[v.colors.background, v.colors.surface, v.colors.surfaceAlt],
      ...(v.background.style === "solid" ? [] : [v.background.end]),
    ]) {
      // Reserve a little headroom for subtle background art.
      if (contrast(v.colors[fg], bg) < 4.7)
        throw new EditorInputError(
          `${fg}: choose a lighter or darker color for readable text (contrast 4.7:1).`,
        );
    }
  }
  return JSON.parse(JSON.stringify(v));
}
export function editorCardTheme(
  value: EditorTheme,
  id = "editor-preview",
): Readonly<CardTheme> {
  const v = validateEditorTheme(value);
  return Object.freeze({
    id,
    name: v.name.trim(),
    description: "Organization custom theme",
    scope: "organization",
    organization: "custom",
    brand: v.brand.trim(),
    radius: v.radius,
    neon: false,
    colors: Object.freeze({ ...v.colors }),
    backgroundDesign: Object.freeze({ ...v.background }),
  });
}
