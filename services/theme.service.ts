import { db } from "./database.service";
import { ThemePreferences } from "./themePreferences.service";
import { themeRegistry } from "./themeRegistry.service";
import "./organization.service";
export const themePreferences = new ThemePreferences(db, themeRegistry);
