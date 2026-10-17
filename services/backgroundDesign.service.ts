/** Local, bounded design tokens. Older published themes need only style/end/angle. */
export const BACKGROUND_STYLES = [
  "solid",
  "gradient",
  "aurora",
  "contours",
  "satin",
  "circuit",
  "chrome",
  "prism",
  "orbit",
  "frost",
] as const;
export type BackgroundStyle = (typeof BACKGROUND_STYLES)[number];
export interface BackgroundDesign {
  style: BackgroundStyle;
  end: string;
  angle: number;
  intensity?: number;
}
export function validBackground(value: unknown): value is BackgroundDesign {
  const v = value as BackgroundDesign;
  return (
    !!v &&
    typeof v === "object" &&
    !Array.isArray(v) &&
    Object.keys(v).every((k) =>
      ["style", "end", "angle", "intensity"].includes(k),
    ) &&
    BACKGROUND_STYLES.includes(v.style) &&
    typeof v.end === "string" &&
    /^#[0-9a-f]{6}$/i.test(v.end) &&
    Number.isInteger(v.angle) &&
    v.angle >= 0 &&
    v.angle <= 360 &&
    (v.intensity === undefined ||
      (Number.isInteger(v.intensity) && v.intensity >= 0 && v.intensity <= 100))
  );
}
