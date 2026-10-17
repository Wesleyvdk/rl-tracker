import { readFileSync } from "node:fs";

export const DEFAULT_THEME = "rose";
export interface ThemeColors {
  background: string;
  surface: string;
  surfaceAlt: string;
  text: string;
  muted: string;
  border: string;
  accent: string;
  positive: string;
  negative: string;
  warning: string;
}
export interface CardTheme {
  id: string;
  name: string;
  description: string;
  scope: "public" | "organization";
  organization?: string;
  brand?: string;
  logo?: string;
  radius: number;
  neon: boolean;
  backgroundDesign?: Readonly<{
    style: "solid" | "gradient" | "aurora" | "contours";
    end: string;
    angle: number;
  }>;
  colors: Readonly<ThemeColors>;
}
const colorKeys: (keyof ThemeColors)[] = [
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
];
const slug = /^[a-z][a-z0-9-]{0,39}$/;
export class ThemeRegistry {
  private themes = new Map<string, Readonly<CardTheme>>();
  private organizations = new Map<string, string>();
  private custom?: {
    approved(guild: string): boolean;
    get(id: string): Readonly<CardTheme> | undefined;
    allowed(id: string, guild?: string | null): boolean;
    available(guild?: string | null): Readonly<CardTheme>[];
  };
  attachCustom(provider: NonNullable<ThemeRegistry["custom"]>) {
    this.custom = provider;
  }
  constructor(
    catalog: unknown,
    bindings: unknown = { version: 1, organizations: [] },
  ) {
    const c = catalog as any,
      b = bindings as any;
    if (
      c?.version !== 1 ||
      !Array.isArray(c.themes) ||
      !c.themes.length ||
      c.themes.length > 500
    )
      throw new Error("Invalid theme catalog");
    for (const theme of c.themes) {
      if (
        typeof theme.id !== "string" ||
        !slug.test(theme.id) ||
        this.themes.has(theme.id) ||
        typeof theme.name !== "string" ||
        !theme.name.trim() ||
        theme.name.length > 40 ||
        typeof theme.description !== "string" ||
        theme.description.length > 100 ||
        !["public", "organization"].includes(theme.scope) ||
        typeof theme.neon !== "boolean" ||
        !Number.isInteger(theme.radius) ||
        theme.radius < 0 ||
        theme.radius > 20 ||
        !colorKeys.every(
          (k) =>
            typeof theme.colors?.[k] === "string" &&
            /^#[0-9a-f]{6}$/i.test(theme.colors[k]),
        ) ||
        (theme.scope === "organization" &&
          (typeof theme.organization !== "string" ||
            !slug.test(theme.organization))) ||
        (theme.brand !== undefined &&
          (typeof theme.brand !== "string" || theme.brand.length > 22)) ||
        (theme.logo !== undefined &&
          (typeof theme.logo !== "string" ||
            !/^[a-z][a-z0-9-]*\/[a-z0-9-]+\.(png|webp)$/.test(theme.logo)))
      )
        throw new Error("Invalid theme definition");
      this.themes.set(
        theme.id,
        Object.freeze({ ...theme, colors: Object.freeze({ ...theme.colors }) }),
      );
    }
    if (this.get(DEFAULT_THEME)?.scope !== "public")
      throw new Error("Default theme must be public");
    if (b?.version !== 1 || !Array.isArray(b.organizations))
      throw new Error("Invalid organization theme bindings");
    for (const org of b.organizations) {
      if (
        typeof org.id !== "string" ||
        !slug.test(org.id) ||
        !this.all().some((t) => t.organization === org.id) ||
        !Array.isArray(org.guildIds)
      )
        throw new Error("Invalid organization theme binding");
      for (const guild of org.guildIds) {
        if (
          typeof guild !== "string" ||
          !/^\d{17,20}$/.test(guild) ||
          this.organizations.has(guild)
        )
          throw new Error("Invalid or duplicate organization guild");
        this.organizations.set(guild, org.id);
      }
    }
  }
  get(id: string) {
    return this.themes.get(id) ?? this.custom?.get(id);
  }
  all() {
    return [...this.themes.values()];
  }
  allowed(id: string, guild?: string | null) {
    if (!this.themes.has(id)) return this.custom?.allowed(id, guild) ?? false;
    const theme = this.get(id);
    return (
      !!theme &&
      (theme.scope === "public" ||
        (!!guild &&
          typeof theme.organization === "string" &&
          this.organizations.has(guild) &&
          this.custom?.approved(guild) === true &&
          this.organizations.get(guild) === theme.organization))
    );
  }
  available(guild?: string | null) {
    return [
      ...this.all().filter((t) => this.allowed(t.id, guild)),
      ...(this.custom?.available(guild) ?? []),
    ];
  }
}
const catalog = JSON.parse(
  readFileSync(new URL("../themes/catalog.json", import.meta.url), "utf8"),
);
const bindings = process.env.ORGANIZATION_THEMES_PATH
  ? JSON.parse(readFileSync(process.env.ORGANIZATION_THEMES_PATH, "utf8"))
  : { version: 1, organizations: [] };
export const themeRegistry = new ThemeRegistry(catalog, bindings);
export type ThemeInput = string | Readonly<CardTheme>;
export function getTheme(id?: ThemeInput): Readonly<CardTheme> {
  if (id && typeof id !== "string") return id;
  return (
    themeRegistry.get(id || DEFAULT_THEME) || themeRegistry.get(DEFAULT_THEME)!
  );
}
