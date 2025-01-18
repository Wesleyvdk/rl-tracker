import puppeteer from "puppeteer";
import getRankTier from "./rankTier.service";
import parseRewardLevel from "./parseRewardLevel.service";

export default async function getRanksByTable(
  browser: any,
  username: string
): Promise<any> {
  const page = await browser.newPage();

  // Set a user agent to mimic a real browser
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36"
  );

  // Navigate to the target page
  await page.goto(
    `https://rocketleague.tracker.network/rocket-league/profile/epic/${username}/overview`,
    { waitUntil: "networkidle2" }
  );

  // Wait for the element with the specific class
  const element = await Promise.race([
    page.waitForSelector(
      ".peak-rating-widget.trn-card.trn-card--bordered.bg-surface-2",
      { timeout: 10000 }
    ),
    page.waitForSelector("div.content.content--error", { timeout: 10000 }),
  ]);

  // Check if the 404 error page exists
  const is404 = await page.evaluate(() => {
    const errorDiv = document.querySelector("div.content.content--error");
    const errorMessage = errorDiv?.querySelector("h1")?.textContent?.trim();
    return errorMessage === "Player Not Found";
  });

  if (is404) {
    console.error("No player found");
    await browser.close();
    return { error: `Profile for username "${username}" not found.` };
  }
  const listRanks = await page.evaluate(() => {
    const elements = document.querySelectorAll(".trn-grid .trn-grid--vertical");
    return Array.from(elements).map((el) => el.textContent!.trim());
  });
  const parsedRewardLevel = parseRewardLevel(listRanks);
  // Select the table body and extract rows
  const tableData = await page.evaluate(() => {
    const table = document.querySelector("table.trn-table tbody"); // Adjust selector to your table

    if (!table) return null;
    // Get all rows
    const rows = Array.from(table.querySelectorAll("tr"));
    const firstRows = rows.slice(1, 4);
    const lastRow = rows[rows.length - 1];
    const selectedRows = [...firstRows, lastRow];

    // Map over rows to create objects
    const data: any = selectedRows.map((row, rowIndex) => {
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
      const division = "Division " + rank.split("Division")[1].trim();
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

    return data;
  });

  await page.close();

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
}
