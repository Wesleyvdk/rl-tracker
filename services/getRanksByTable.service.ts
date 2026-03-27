import getRankTier from "./rankTier.service";
import parseRewardLevel from "./parseRewardLevel.service";
import { isCloudflareChallenge } from "./cloudflareCheck.service";
import { getRandomUserAgent } from "./userAgents";
import { launchBrowser } from "./browser.service";
import { buildTrackerProfileUrl } from "./trackerProfile.service";

export default async function getRanksByTable(
  username: string,
  platform: string = "epic"
): Promise<any> {
  const profile = buildTrackerProfileUrl(platform, username);
  if (!profile.ok) {
    return { error: profile.error };
  }

  let browser = await launchBrowser();
  try {
    const url = profile.url;

    const loadPage = async (attempt: number): Promise<any> => {
      try {
        const pg = await browser.newPage();
        await pg.setUserAgent(getRandomUserAgent());

        await pg.goto(url, { waitUntil: "networkidle2" });

        if (await isCloudflareChallenge(pg)) {
          await pg.close();
          if (attempt < 2) {
            console.log(`Cloudflare challenge detected for ${username}, retrying in 12s (attempt ${attempt + 1})...`);
            await new Promise((r) => setTimeout(r, 12000));
            return loadPage(attempt + 1);
          }
          console.log(`Cloudflare challenge persisted after retries for ${username}`);
          return null;
        }

        return pg;
      } catch (e: any) {
        console.error(`[PROXY ERROR] Navigation failed attempt ${attempt + 1}: ${e.message}`);
        await browser.close().catch(() => { });
        if (attempt < 3) {
          console.log(`[PROXY] Rotating to a new proxy and retrying...`);
          browser = await launchBrowser();
          return loadPage(attempt + 1);
        }
        return null;
      }
    };

    const page = await loadPage(0);
    if (!page) {
      return { error: `Cloudflare verification blocked the request for "${username}". Please try again in a minute.` };
    }

    // Wait for profile card, stats table, or error page.
    await Promise.race([
      page.waitForSelector(".peak-rating-widget.trn-card.trn-card--bordered.bg-surface-2", { timeout: 12000 }),
      page.waitForSelector("table.trn-table tbody, table tbody", { timeout: 12000 }),
      page.waitForSelector("div.content.content--error", { timeout: 12000 }),
    ]).catch(() => null);

    // Check if the 404 error page exists
    const is404 = await page.evaluate(() => {
      const errorDiv = document.querySelector("div.content.content--error");
      const errorMessage = errorDiv?.querySelector("h1")?.textContent?.trim();
      return errorMessage === "Player Not Found";
    });

    if (is404) {
      console.error("No player found");
      return { error: `Profile for username "${username}" not found.` };
    }
    const listRanks = await page.evaluate(() => {
      const elements = document.querySelectorAll(".trn-grid .trn-grid--vertical");
      return Array.from(elements).map((el) => el.textContent!.trim());
    });
    const parsedRewardLevel = parseRewardLevel(listRanks);
    // Select the table body and extract rows
    const tableData = await page.evaluate(() => {
      const table = document.querySelector("table.trn-table tbody, table tbody");

      if (!table) return null;
      // Get all rows
      const rows = Array.from(table.querySelectorAll("tr"));
      const firstRows = rows.slice(1, 4);
      const lastRow = rows[rows.length - 1];
      const selectedRows = [...firstRows, lastRow];

      // Map over rows to create objects
      const data: any = selectedRows.map((row) => {
        const columns = Array.from(row.querySelectorAll("td"));

        const streakText =
          columns[6]?.querySelector(".result")?.textContent?.trim() ||
          columns[5]?.querySelector(".result")?.textContent?.trim() ||
          null;
        let streak = null;
        if (streakText) {
          const isWin = streakText.includes("Win");
          const streakValue = parseInt(streakText.match(/\d+/)?.[0] || "0", 10);
          streak = isWin ? streakValue : -streakValue; // Positive for Win, Negative for Loss
        }

        const rank = columns[1]?.querySelector(".rank")?.textContent?.trim();
        if (!rank) return "unranked"; // Skip if no rank found
        const rankTier = rank.split("Division")[0].trim();
        const divisionPart = rank.includes("Division") ? rank.split("Division")[1]?.trim() : "";
        const division = divisionPart ? `Division ${divisionPart}` : "Division -";
        const mmr =
          columns[2]
            ?.querySelector(".mmr .value")
            ?.textContent?.trim()
            .replace(",", "") || "0";
        const rating = parseInt(mmr);

        // Create an object based on your table structure
        return {
          playlist:
            columns[1]?.querySelector(".playlist")?.textContent?.trim() || null,
          rank: rankTier,
          division: division,
          mmr: rating,
          matches:
            columns[6]?.querySelector(".value")?.textContent?.trim() ||
            columns[5]?.querySelector(".value")?.textContent?.trim() ||
            null,
          streak: streak,
          icon: columns[0]?.querySelector("img")?.getAttribute("src") || null,
        };
      });

      return data.filter((entry: any) => entry !== "unranked");
    });

    await page.close();

    if (!tableData || tableData.length === 0) {
      return {
        error:
          `Profile for "${username}" loaded, but rank table data was unavailable. ` +
          `Please try again in a minute.`,
      };
    }

    if (tableData != null) {
      tableData.forEach((element: any) => {
        const { tier, nextMMR, prevMMR } = getRankTier(
          element.playlist,
          element.mmr
        );
        element.nextMMR = nextMMR;
        element.prevMMR = prevMMR;
      });
    }
    //   console.log(JSON.stringify(tableData, null, 2));
    return { tableData, parsedRewardLevel };
  } finally {
    await browser.close();
  }
}
