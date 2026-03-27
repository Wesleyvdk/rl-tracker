import { SeasonData, AverageStats, SeasonStatsResult } from "../types";
import { isCloudflareChallenge } from "./cloudflareCheck.service";
import { getRandomUserAgent } from "./userAgents";
import { launchBrowser } from "./browser.service";
import { buildTrackerProfileUrl } from "./trackerProfile.service";
import { canonicalizeSeasonLabels, normalizeSeasonLabel } from "./seasonLabel.service";

// Helper to map rank names to numeric tiers for averaging
const rankToTier: { [key: string]: number } = {
  "Supersonic Legend": 22,
  "Grand Champion III": 21,
  "Grand Champion II": 20,
  "Grand Champion I": 19,
  "Champion III": 18,
  "Champion II": 17,
  "Champion I": 16,
  "Diamond III": 15,
  "Diamond II": 14,
  "Diamond I": 13,
  "Platinum III": 12,
  "Platinum II": 11,
  "Platinum I": 10,
  "Gold III": 9,
  "Gold II": 8,
  "Gold I": 7,
  "Silver III": 6,
  "Silver II": 5,
  "Silver I": 4,
  "Bronze III": 3,
  "Bronze II": 2,
  "Bronze I": 1,
  "Unranked": 0,
};

// Helper to map numeric tiers back to rank names
const tierToRank = Object.entries(rankToTier).reduce((acc, [rank, tier]) => {
  acc[tier] = rank;
  return acc;
}, {} as { [key: number]: string });

/**
 * Race a promise against a timeout. Resolves with the promise value or the
 * fallback when the deadline is exceeded.
 */
function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

async function waitForStatsTable(page: any, attempts: number = 30, intervalMs: number = 500): Promise<boolean> {
  for (let attempt = 0; attempt < attempts; attempt++) {
    const found = (await page.evaluate(() => {
      const tableRows = document.querySelectorAll("table.trn-table tbody tr, table tbody tr");
      if (tableRows.length > 0) return true;
      const noData = Array.from(document.querySelectorAll("table tbody, .content"))
        .some((el) => /no data|no matches|no stats/i.test(el.textContent || ""));
      return noData;
    })) as boolean;
    if (found) return true;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}

const SCRAPER_CONFIG = {
  initialTableChecks: 30,
  retryTableChecks: 24,
  tablePollIntervalMs: 500,
  reloadSettleMs: 1200,
  bannerSettleMs: 1000,
  seasonChangeSettleMs: 1500,
  firstSeasonSettleMs: 500,
  seasonSelectTimeoutMs: 5000,
  scrapeTimeoutMs: 6500,
};

export default async function getSeasonStats(
  username: string,
  platform: string = "epic",
  maxSeasons: number = 10,
  onlyCompetitive: boolean = false
): Promise<SeasonStatsResult> {
  let browser = await launchBrowser();
  try {
    const profile = buildTrackerProfileUrl(platform, username);
    if (!profile.ok) {
      return { seasonData: [], averageStats: [], failureReason: "invalid_profile_input" };
    }
    const url = profile.url;
    let loadBlockedByCloudflare = false;

    const loadPage = async (attempt: number): Promise<any> => {
      try {
        const page = await browser.newPage();
        // Pipe browser console to node terminal for debugging (single listener)
        page.on("console", (msg: any) => {
          const text = msg.text();
          if (text.includes("[DEBUG-JS]") || text.includes("[DOM]")) {
            console.log(`[BROWSER-JS] ${text}`);
          }
        });

        await page.setViewport({ width: 1920, height: 1080 });
        await page.setUserAgent(getRandomUserAgent());

        // Auto-dismiss dialogs (can freeze the JS thread if left open)
        page.on('dialog', async (dialog: any) => {
          console.log(`[DEBUG-JS] Auto-dismissing dialog: ${dialog.message()}`);
          await dialog.dismiss().catch(() => { });
        });

        // Block heavy resources and ad networks to prevent JS thread freezes
        await page.setRequestInterception(true);
        page.on('request', (req: any) => {
          const type = req.resourceType();
          const url = req.url().toLowerCase();
          if (
            // Block video media and fonts (we only need the DOM)
            ['media', 'font'].includes(type) ||
            // Block known ad network scripts that lock up the JS CPU
            url.includes('doubleclick') ||
            url.includes('googlesyndication') ||
            url.includes('amazon-adsystem') ||
            url.includes('criteo') ||
            url.includes('pubmatic') ||
            url.includes('rubiconproject') ||
            url.includes('adform') ||
            url.includes('quantserve') ||
            url.includes('scorecardresearch') ||
            url.includes('vlitag') ||
            url.includes('taboola')
          ) {
            req.abort().catch(() => { });
          } else {
            req.continue().catch(() => { });
          }
        });

        console.log(`[DEBUG] Navigating to ${url}...`);
        await page.goto(url, { waitUntil: "networkidle2" });
        console.log(`[DEBUG] Navigation finished.`);

        // Check for Cloudflare challenge
        if (await isCloudflareChallenge(page)) {
          await page.close();
          if (attempt < 2) {
            console.log(`Cloudflare challenge detected for ${username}, retrying in 12s (attempt ${attempt + 1})...`);
            await new Promise((r) => setTimeout(r, 12000));
            return loadPage(attempt + 1);
          }
          console.log(`Cloudflare challenge persisted after retries for ${username}`);
          loadBlockedByCloudflare = true;
          return null;
        }

        return page;
      } catch (e: any) {
        console.error(`[PROXY ERROR] Navigation failed attempt ${attempt + 1}: ${e.message}`);
        // Browser or proxy failed entirely. Close and rotate to a fresh proxy.
        await browser.close().catch(() => { });
        if (attempt < 3) { // Max 3 proxy rotations
          console.log(`[PROXY] Rotating to a new proxy and retrying...`);
          browser = await launchBrowser();
          return loadPage(attempt + 1);
        }
        return null;
      }
    };

    const page = await loadPage(0);
    if (!page) {
      return {
        seasonData: [],
        averageStats: [],
        failureReason: loadBlockedByCloudflare ? "cloudflare_blocked" : "table_unavailable",
      };
    }

    const is404 = (await page.evaluate(() => {
      const errorDiv = document.querySelector("div.content.content--error");
      const errorMessage = errorDiv?.querySelector("h1")?.textContent?.trim();
      return errorMessage === "Player Not Found";
    })) as boolean;
    if (is404) {
      await page.close().catch(() => { });
      return { seasonData: [], averageStats: [], failureReason: "profile_not_found" };
    }

    // Dismiss cookie/privacy banners using CDP clicks (page.click), NOT
    // element.click() inside evaluate. Firing .click() inside evaluate can
    // trigger async JS handlers (consent SDKs, analytics) that intermittently
    // block the evaluate queue for all subsequent page.evaluate() calls.
    try {
      // Step 1: mark matching buttons with a data attribute (no clicks)
      const count = (await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll(
          'button, .trn-button, .banner button, [class*="banner"] button'
        ));
        let i = 0;
        for (const btn of buttons) {
          const text = btn.textContent?.toLowerCase() || '';
          if (text.includes('accept') || text.includes('dismiss') || text.includes('agree')) {
            console.log(`[DEBUG-JS] Marking banner button: "${btn.textContent?.trim()}"`);
            btn.setAttribute('data-rl-dismiss', String(i++));
          }
        }
        return i;
      })) as number;

      // Step 2: click each marked button via CDP (outside evaluate context)
      for (let i = 0; i < count; i++) {
        await page.click(`[data-rl-dismiss="${i}"]`).catch(() => { });
        await new Promise(r => setTimeout(r, 200));
      }
    } catch (e) {
      console.log('[DEBUG] Banner dismissal failed (ignoring)');
    }
    await new Promise(r => setTimeout(r, SCRAPER_CONFIG.bannerSettleMs));


    // Poll for the table ourselves — avoids page.waitForSelector's internal
    // MutationObserver evaluate which can leave the Runtime.evaluate queue blocked.
    let tableFound = await waitForStatsTable(
      page,
      SCRAPER_CONFIG.initialTableChecks,
      SCRAPER_CONFIG.tablePollIntervalMs
    );
    if (!tableFound) {
      console.log("Table not found after initial wait; retrying with one reload...");
      await page.reload({ waitUntil: "networkidle2" }).catch(() => { });
      await new Promise((r) => setTimeout(r, SCRAPER_CONFIG.reloadSettleMs));
      tableFound = await waitForStatsTable(
        page,
        SCRAPER_CONFIG.retryTableChecks,
        SCRAPER_CONFIG.tablePollIntervalMs
      );
    }
    if (!tableFound) {
      console.log("Table not found after retry, profile may be private or not exist");
      const pageState = (await withTimeout(page.evaluate(() => {
        const bodyText = document.body?.innerText?.slice(0, 400) || "";
        const title = document.title || "";
        const hasCloudflareWord = /cloudflare|verify you are human|checking your browser/i.test(bodyText + " " + title);
        const hasErrorContent = !!document.querySelector("div.content.content--error");
        const hasAnyTable = !!document.querySelector("table");
        const hasSeasonDropdown = !!document.querySelector("li.dropdown__item, .dropdown__item-label");
        return { title, hasCloudflareWord, hasErrorContent, hasAnyTable, hasSeasonDropdown, bodyPreview: bodyText };
      }), 2000, null)) as {
        title: string;
        hasCloudflareWord: boolean;
        hasErrorContent: boolean;
        hasAnyTable: boolean;
        hasSeasonDropdown: boolean;
        bodyPreview: string;
      } | null;
      console.log(`[DEBUG] table-not-found page state for ${platform}/${username}:`, pageState);
      await page.close().catch(() => { });
      return { seasonData: [], averageStats: [], failureReason: "table_unavailable" };
    }




    const seasonData: SeasonData[] = [];

    /**
     * Scrape table data. Purely synchronous evaluate — no Promise, no setTimeout
     * inside it. Returns the DOM data immediately. The calling code waits
     * long enough for the page to have settled before calling this.
     */
    const scrapeTableData = async (): Promise<{ [key: string]: { rank: string; matches: number } }> => {
      return (await page.evaluate(() => {
        const table = document.querySelector('table.trn-table tbody, table tbody');
        if (!table) return {};

        const rows = Array.from(table.querySelectorAll('tr'));
        const data: { [key: string]: { rank: string; matches: number } } = {};

        rows.forEach(row => {
          const columns = Array.from(row.querySelectorAll('td'));
          const playlistName = columns[1]?.querySelector('.playlist')?.textContent?.trim();
          const rankText = columns[1]?.querySelector('.rank')?.textContent?.trim();
          const rank = rankText?.split('Division')[0]?.trim() || '';

          let matchesText = '';
          const col6 = columns[6];
          const col5 = columns[5];
          if (col6) { const v = col6.querySelector('.value'); if (v) matchesText = v.textContent?.trim() || ''; }
          if (!matchesText && col5) { const v = col5.querySelector('.value'); if (v) matchesText = v.textContent?.trim() || ''; }

          const matchesMatch = matchesText.match(/^(\d[\d,]*)/);
          const matches = matchesMatch ? parseInt(matchesMatch[1].replace(/,/g, ''), 10) : 0;
          if (playlistName && rank) data[playlistName] = { rank, matches };
        });
        return data;
      })) as { [key: string]: { rank: string; matches: number } };
    };

    /**
     * Read season labels from the DOM. Purely synchronous — no Promise inside.
     */
    const getAllSeasons = async (): Promise<string[]> => {
      console.log(`[DEBUG] Entering getAllSeasons...`);
      try {
        const seasonsFromDom = (await page.evaluate(() => {
          const labels = Array.from(document.querySelectorAll('.dropdown__item-label'));
          const found = labels
            .map(el => el.textContent?.trim() || '')
            .filter(text => text && /Season\s+\d+|S\d+/i.test(text));
          console.log(`[DEBUG-JS] getAllSeasons: found ${found.length} labels in DOM`);
          return Array.from(new Set(found));
        })) as string[];
        const canonical = canonicalizeSeasonLabels(seasonsFromDom);
        console.log(`[DEBUG] Detected ${canonical.length} canonical seasons.`);
        return canonical;
      } catch (e: any) {
        console.log(`[DEBUG] getAllSeasons failed: ${e.message}`);
        return [];
      }
    };

    /**
     * Select a season by directly clicking its li element.
     * The dropdown items are always in the DOM (confirmed: getAllSeasons reads them
     * without opening the dropdown). We skip opening the dropdown entirely and
     * just call .click() on the matching li — one evaluate, no timing gaps.
     */
    const selectSeasonFromDropdown = async (seasonLabel: string): Promise<boolean> => {
      const result = (await page.evaluate((label: string) => {
        // First, click the dropdown to open it so elements are interactable
        const dropdown = document.querySelector('div.dropdown');
        if (dropdown) (dropdown as HTMLElement).click();

        const items = Array.from(document.querySelectorAll('li.dropdown__item'));
        console.log(`[DEBUG-JS] selectSeason: ${items.length} li items in DOM`);

        for (const li of items) {
          const text = li.querySelector('.dropdown__item-label')?.textContent?.trim()
            ?? li.textContent?.trim();
          if (text === label) {
            (li as HTMLElement).click();
            console.log(`[DEBUG-JS] selectSeason: clicked "${text}"`);
            return { success: true, matched: text ?? '' };
          }
        }

        const sample = items
          .map(i => i.querySelector('.dropdown__item-label')?.textContent?.trim())
          .filter(Boolean).slice(0, 5);
        console.log(`[DEBUG-JS] selectSeason: no match for "${label}". Sample: ${sample.join(', ')}`);
        return { success: false, matched: '' };
      }, seasonLabel)) as { success: boolean; matched: string };

      if (!result.success) console.log(`[DEBUG] No li match for "${seasonLabel}"`);
      return result.success;
    };



    // Get all available seasons (reads from DOM, no clicks needed)
    const allSeasons = await getAllSeasons();
    console.log(`Found ${allSeasons.length} seasons in dropdown`);



    // Limit to maxSeasons if not 0
    const seasonsToScrape = maxSeasons > 0 ? allSeasons.slice(0, maxSeasons) : allSeasons;
    console.log(`Will scrape ${seasonsToScrape.length} seasons:`, seasonsToScrape);

    // Scrape each season
    for (let i = 0; i < seasonsToScrape.length; i++) {
      const seasonLabel = seasonsToScrape[i];
      const normalizedLabel = normalizeSeasonLabel(seasonLabel);
      console.log(`Scraping ${normalizedLabel}...`);

      // The first season (index 0) is already displayed on page load — no click needed.
      // For all subsequent seasons, open the dropdown and select.
      if (i > 0) {
        console.log(`[DEBUG] Selecting season: ${seasonLabel}`);
        const clicked = await withTimeout(
          selectSeasonFromDropdown(seasonLabel),
          SCRAPER_CONFIG.seasonSelectTimeoutMs,
          false
        );
        console.log(`[DEBUG] Selection result: ${clicked}`);
        if (!clicked) {
          console.log(`Could not click ${seasonLabel} (or timed out), skipping.`);
          continue;
        }
      } else {
        console.log(`[DEBUG] Season ${seasonLabel} is already displayed, skipping dropdown click.`);
      }

      // Wait for the page to re-render with the new season's data
      const waitMs = i === 0 ? SCRAPER_CONFIG.firstSeasonSettleMs : SCRAPER_CONFIG.seasonChangeSettleMs;
      await new Promise(r => setTimeout(r, waitMs));

      // Scrape the data
      console.log(`[DEBUG] Scraping table data...`);
      const playlists = await withTimeout(scrapeTableData(), SCRAPER_CONFIG.scrapeTimeoutMs, null);

      if (!playlists) {
        console.log(`[DEBUG] scrapeTableData hung/timed out for ${seasonLabel}! Skipping season.`);
        continue;
      }

      if (onlyCompetitive) {
        const corePlaylists = ["Ranked Duel 1v1", "Ranked Doubles 2v2", "Ranked Standard 3v3"];
        for (const key of Object.keys(playlists)) {
          if (!corePlaylists.includes(key)) {
            delete playlists[key];
          }
        }
      }

      const playlistCount = Object.keys(playlists).length;
      console.log(`[DEBUG] Scraped ${playlistCount} playlists.`);

      if (playlistCount > 0) {
        // Calculate total matches by summing all playlist matches
        const totalMatches = Object.values(playlists).reduce((sum, p: any) => sum + p.matches, 0);

        seasonData.push({
          season: normalizedLabel,
          totalMatches,
          playlists
        } as any);
        console.log(`Got ${normalizedLabel}: ${playlistCount} playlists, ${totalMatches} total matches`);
      } else {
        console.log(`[DEBUG] No playlists found for ${normalizedLabel}, skipping.`);
      }
    }

    await page.close();

    // Calculate averages
    const playlistStats: { [key: string]: { totalMatches: number; totalTier: number; count: number } } = {};
    let totalGamesAcrossSeasons = 0;
    let seasonCount = 0;

    seasonData.forEach((season: any) => {
      totalGamesAcrossSeasons += season.totalMatches || 0;
      seasonCount++;

      Object.entries(season.playlists).forEach(([playlist, data]: [string, any]) => {
        if (!playlistStats[playlist]) {
          playlistStats[playlist] = { totalMatches: 0, totalTier: 0, count: 0 };
        }
        playlistStats[playlist].totalMatches += data.matches;
        playlistStats[playlist].totalTier += rankToTier[data.rank] || 0;
        playlistStats[playlist].count++;
      });
    });

    const averageStats: AverageStats[] = Object.entries(playlistStats).map(([playlist, stats]) => {
      const avgTier = Math.round(stats.totalTier / stats.count);
      return {
        playlist,
        averageMatches: Math.round(stats.totalMatches / stats.count),
        averageRankTier: avgTier,
        averageRankName: tierToRank[avgTier] || "Unranked"
      };
    });

    const avgGamesPerSeason = seasonCount > 0 ? Math.round(totalGamesAcrossSeasons / seasonCount) : 0;
    console.log(`Average games per season (from labels): ${avgGamesPerSeason}`);

    return { seasonData, averageStats };
  } finally {
    await browser.close();
  }
}
