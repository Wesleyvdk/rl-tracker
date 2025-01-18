import puppeteer from "puppeteer";
import { PeakRating } from "../types";
import parseRankEntry from "./parseRankEntry.service";
import rankEntries from "./rankEntries.service";
import getRankTier from "./rankTier.service";

export default async function getPeaks(): Promise<PeakRating> {
  try {
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();

    // Set a user agent to mimic a real browser
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36"
    );

    // Navigate to the player's stats page
    await page.goto(
      "https://rocketleague.tracker.network/rocket-league/profile/steam/76561198812594844/overview",
      {
        waitUntil: "networkidle2", // Wait for network activity to idle
      }
    );

    // Wait for the element with the specific class
    await page.waitForSelector(
      ".peak-rating-widget.trn-card.trn-card--bordered.bg-surface-2",
      { timeout: 10000 } // Set a timeout to avoid infinite waiting
    );

    // Extract the ranks from peak rank card or relevant data
    const ranks = await page.evaluate(() => {
      const elements = document.querySelectorAll(
        ".peak-rating-widget.trn-card.trn-card--bordered.bg-surface-2"
      );
      return Array.from(elements).map((el) => el.textContent!.trim());
    });

    console.log("Raw Ranks:", JSON.stringify(ranks, null, 2)); // Display the raw data

    //  Parse the extracted ranks into a structured format
    const rankEntry: any = await rankEntries(ranks);
    console.log("Rank Entries:", JSON.stringify(rankEntry, null, 2)); // Display the rank entries
    const parsedRanks: PeakRating = {};
    rankEntry.forEach((rank: any) => {
      const parsedRank = parseRankEntry(rank);
      if (parsedRank) {
        Object.keys(parsedRank).forEach((mode) => {
          const currentRating = parsedRank[mode].Current.Rating;
          const { tier, nextMMR, prevMMR } = getRankTier(mode, currentRating);

          parsedRank[mode].Current.RankTier = tier; // Assign rank tier
          parsedRank[mode].Current.NextMMR = nextMMR; // Assign next MMR
          parsedRank[mode].Current.PrevMMR = prevMMR; // Assign previous MMR
        });
        Object.assign(parsedRanks, parsedRank);
      }
    });

    console.log("Raw Ranks:", JSON.stringify(ranks, null, 2)); // Display the raw data
    console.log("Rank Entries:", JSON.stringify(rankEntries, null, 2)); // Display the rank entries
    console.log("Parsed Ranks:", JSON.stringify(parsedRanks, null, 2)); // Display the parsed ranks
    return parsedRanks;
  } catch (error) {
    console.log("An error occurred:", error);
    return {};
  }
}
