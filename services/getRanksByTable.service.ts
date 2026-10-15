import { launchBrowser } from "./browser.service";
import { buildTrackerProfileUrl } from "./trackerProfile.service";
import { getRandomUserAgent } from "./userAgents";
import { parseProfileHtml, type ProfileResult } from "./profileParser.service";

export default async function getRanksByTable(
  username: string,
  platform = "epic",
): Promise<ProfileResult> {
  const profile = buildTrackerProfileUrl(platform, username);
  if (!profile.ok)
    return { error: profile.error, failureReason: "invalid_profile_input" };
  const browser = await launchBrowser();
  const deadline = setTimeout(
    () => void browser.close().catch(() => {}),
    45000,
  );
  try {
    const page = await browser.newPage();
    await page.setUserAgent(getRandomUserAgent());
    await page.goto(profile.url, { waitUntil: "networkidle2", timeout: 25000 });
    await page
      .waitForSelector(
        "table.trn-table tbody tr, .content--error, #challenge-form",
        { timeout: 12000 },
      )
      .catch(() => {});
    return parseProfileHtml(await page.content());
  } catch (error) {
    return {
      error: "Unable to retrieve this profile right now.",
      failureReason: /timeout|closed/i.test(String(error))
        ? "timeout"
        : "fetch_failed",
    };
  } finally {
    clearTimeout(deadline);
    await browser.close().catch(() => {});
  }
}
