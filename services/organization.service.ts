import { db } from "./database.service";
import { themeRegistry } from "./themeRegistry.service";
import { OrganizationSettings } from "./organizationSettings.service";
export const organizations = new OrganizationSettings(db);
themeRegistry.attachCustom(organizations);
