import { launchBrowser } from "./browser.service";
import { buildTrackerProfileUrl } from "./trackerProfile.service";
import {
  seasonPage,
  seasonFromPage,
  historyResult,
  SEASON_EXTRACTOR_VERSION,
  resumableSeason,
} from "./seasonPage.service";
import { seasonAverages } from "./seasonAverages.service";
import type { SeasonOption } from "./seasonLabel.service";
import type { SeasonData, SeasonStatsResult } from "../types";

// Observe the site's own browser request; match counts are read only from DOM.
export function matchesSeasonResponse(
  url: string,
  id: number,
  platform: string,
  name: string,
) {
  try {
    const u = new URL(url);
    return (
      u.hostname === "api.tracker.gg" &&
      decodeURIComponent(u.pathname) ===
        `/api/v2/rocket-league/standard/profile/${platform}/${name}/segments/playlist` &&
      u.searchParams.get("season") === String(id)
    );
  } catch {
    return false;
  }
}
export function matchesProfilePage(
  url: string,
  platform: string,
  name: string,
) {
  const expected = buildTrackerProfileUrl(platform, name);
  if (!expected.ok) return false;
  try {
    const current = new URL(url),
      target = new URL(expected.url);
    return (
      current.protocol === "https:" &&
      current.hostname === target.hostname &&
      decodeURIComponent(current.pathname).replace(/\/$/, "") ===
        decodeURIComponent(target.pathname).replace(/\/$/, "")
    );
  } catch {
    return false;
  }
}
export async function boundedPage<T>(
  page: any,
  operation: () => Promise<T>,
  ms: number,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  try {
    return await Promise.race([
      operation(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          void page.close().catch(() => {});
          reject(new Error("Season deadline exceeded"));
        }, ms);
      }),
    ]);
  } finally {
    clearTimeout(timer!);
  }
}
export async function readBrowserSeason(
  page: any,
  option: SeasonOption,
  platform: string,
  name: string,
  competitive: boolean,
): Promise<SeasonData> {
  if (!matchesProfilePage(page.url(), platform, name))
    throw new Error("Unexpected profile navigation");
  const initial = seasonPage(await page.content());
  if (initial.selectedId !== option.id) {
    await page.evaluate(() => {
      const state = {
        started: false,
        observer: null as MutationObserver | null,
      };
      state.observer = new MutationObserver((records) => {
        const empty =
          document.querySelector("table.trn-table tbody")?.childElementCount ===
          0;
        const indicatorChanged = records.some((r) =>
          [...r.addedNodes, ...r.removedNodes].some(
            (n) =>
              n instanceof Element &&
              (n.matches(".loading-indicator, [aria-busy='true']") ||
                n.querySelector(".loading-indicator, [aria-busy='true']")),
          ),
        );
        if (
          (empty &&
            (indicatorChanged ||
              document.querySelector(
                ".loading-indicator, [aria-busy='true']",
              ))) ||
          records.some(
            (r) =>
              (r.target as Element).tagName === "TBODY" &&
              (r.target as Element).closest("table.trn-table") &&
              r.removedNodes.length > 0,
          )
        )
          state.started = true;
      });
      state.observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["class", "aria-busy"],
      });
      (window as any).__rlSeasonTransition = state;
    });
    // Register before clicking. A selection label alone does not prove that its table loaded.
    const response = page.waitForResponse(
      (r: any) =>
        r.request().method() === "GET" &&
        matchesSeasonResponse(r.url(), option.id, platform, name),
      { timeout: 12000 },
    );
    void response.catch(() => {});
    const clicked = await page.evaluate((label: string) => {
      const item = Array.from(
        document.querySelectorAll("li.dropdown__item"),
      ).find(
        (li) =>
          li.querySelector(".dropdown__item-label")?.textContent?.trim() ===
          label,
      );
      if (!item) return false;
      (item as HTMLElement).click();
      return true;
    }, option.label);
    if (!clicked) throw new Error("Season selection unavailable");
    const loaded = await response;
    if (
      loaded.status() !== 200 ||
      !/application\/json/i.test(loaded.headers()["content-type"] || "")
    )
      throw new Error("Season request failed");
    // Wait for the browser to finish receiving the response, then let Vue commit its render.
    // This discards the payload; extraction continues from the rendered table.
    await loaded.buffer();
  }
  try {
    const until = Date.now() + 12000;
    while (Date.now() < until) {
      const transitioned =
        initial.selectedId === option.id ||
        (await page.evaluate(
          () => (window as any).__rlSeasonTransition?.started === true,
        ));
      if (!matchesProfilePage(page.url(), platform, name))
        throw new Error("Unexpected profile navigation");
      const result = seasonFromPage(
        await page.content(),
        option,
        competitive,
        initial.selectedId !== option.id,
      );
      // A completed request may leave an already empty table unchanged. That
      // establishes unknown data only; every numeric result still needs a reload.
      if (
        result &&
        (transitioned ||
          (initial.selectedId !== option.id && result.unavailable === true))
      )
        return result;
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error("Season table or identity unavailable");
  } finally {
    await page
      .evaluate(() => {
        (window as any).__rlSeasonTransition?.observer?.disconnect();
        delete (window as any).__rlSeasonTransition;
      })
      .catch(() => {});
  }
}
export default async function getSeasonStats(
  username: string,
  platform = "epic",
  maxSeasons = 10,
  onlyCompetitive = false,
  resume?: SeasonStatsResult,
): Promise<SeasonStatsResult> {
  const profile = buildTrackerProfileUrl(platform, username);
  if (!profile.ok)
    return {
      seasonData: [],
      averageStats: [],
      failureReason: "invalid_profile_input",
    };
  const until = Date.now() + 180000;
  const browser = await launchBrowser();
  const deadline = setTimeout(
    () => void browser.close().catch(() => {}),
    Math.max(1, until - Date.now()),
  );
  let page: any = null;
  const open = async () => {
    if (Date.now() >= until) throw new Error("History deadline exceeded");
    const p = await browser.newPage();
    page = p;
    await p.setUserAgent(
      (await browser.userAgent()).replace("HeadlessChrome/", "Chrome/"),
    );
    await p.setViewport({ width: 1920, height: 1080 });
    await p.setRequestInterception(true);
    p.on("request", (r: any) => {
      const blocked =
        ["media", "font", "image"].includes(r.resourceType()) ||
        /doubleclick|googlesyndication|nitropay|primis|scalibur|scorecardresearch|amazon-adsystem|criteo|pubmatic|rubiconproject|adform|quantserve|taboola/.test(
          r.url(),
        );
      (blocked ? r.abort() : r.continue()).catch(() => {});
    });
    await p
      .goto(profile.url, {
        waitUntil: "domcontentloaded",
        timeout: Math.min(25000, until - Date.now()),
      })
      .catch(() => {});
    if (!matchesProfilePage(p.url(), profile.platform, profile.username))
      throw new Error("Unexpected profile navigation");
    await p
      .waitForSelector(
        "table.trn-table tbody tr, .content--error, #challenge-form",
        { timeout: Math.min(12000, Math.max(1, until - Date.now())) },
      )
      .catch(() => {});
    const readyUntil = Math.min(until, Date.now() + 12000);
    while (Date.now() < readyUntil) {
      const state = seasonPage(await p.content());
      if (
        state.blocked ||
        state.error ||
        (!state.busy &&
          state.options.length &&
          state.selectedId !== null &&
          (state.rows.length || state.noMatches))
      )
        break;
      await new Promise((r) => setTimeout(r, 100));
    }
    const initial = seasonPage(await p.content());
    if (
      !initial.options.length &&
      !initial.blocked &&
      Date.now() < until - 1000
    ) {
      await p
        .reload({
          waitUntil: "domcontentloaded",
          timeout: Math.min(25000, until - Date.now()),
        })
        .catch(() => {});
      await p
        .waitForSelector(
          "table.trn-table tbody tr, .content--error, #challenge-form",
          { timeout: Math.min(12000, Math.max(1, until - Date.now())) },
        )
        .catch(() => {});
      const retryUntil = Math.min(until, Date.now() + 12000);
      while (Date.now() < retryUntil) {
        const state = seasonPage(await p.content());
        if (
          state.blocked ||
          state.error ||
          (!state.busy &&
            state.options.length &&
            state.selectedId !== null &&
            (state.rows.length || state.noMatches))
        )
          break;
        await new Promise((r) => setTimeout(r, 100));
      }
    }
    return p;
  };
  let options: SeasonOption[] = [],
    available = 0;
  const rows: SeasonData[] = [];
  try {
    let state: ReturnType<typeof seasonPage> | undefined;
    for (let attempt = 0; attempt < 2; attempt++) {
      await boundedPage(
        await open(),
        async () => {
          state = seasonPage(await page.content());
        },
        Math.max(1, Math.min(15000, until - Date.now())),
      );
      if (
        state!.options.length &&
        state!.selectedId !== null &&
        !state!.blocked &&
        !state!.error
      )
        break;
      await page.close().catch(() => {});
      page = null;
    }
    if (!state?.options.length || state.blocked || state.error)
      return {
        seasonData: [],
        averageStats: [],
        failureReason: state?.blocked
          ? "cloudflare_blocked"
          : /player not found/i.test(state?.error || "")
            ? "profile_not_found"
            : "table_unavailable",
      };
    available = state.options.length;
    options =
      maxSeasons > 0 ? state.options.slice(0, maxSeasons) : state.options;
    // Resume verified historical rows only. The newest season is always refreshed.
    const requested = new Set(options.map((o) => o.id));
    if (resume?.extractorVersion === SEASON_EXTRACTOR_VERSION)
      rows.push(
        ...resume.seasonData
          .filter(
            (r) =>
              r.seasonId !== options[0]?.id &&
              requested.has(r.seasonId!) &&
              resumableSeason(r, resume.fetchedAt),
          )
          .map((r) => ({ ...r, fetchedAt: r.fetchedAt ?? resume.fetchedAt })),
      );
    for (const option of options) {
      if (rows.some((r) => r.seasonId === option.id)) continue;
      if (Date.now() >= until - 1000) break;
      try {
        if (!page) await open();
        const currentPage = page;
        const row = await boundedPage(
          currentPage,
          () =>
            readBrowserSeason(
              currentPage,
              option,
              profile.platform,
              profile.username,
              onlyCompetitive,
            ),
          Math.max(1, Math.min(15000, until - Date.now())),
        );
        rows.push(row);
      } catch {
        // Closing the old document cancels late clicks/responses before another season.
        await page?.close().catch(() => {});
        page = null;
      }
    }
    const result = historyResult(options, available, rows);
    result.averageStats = seasonAverages(result.seasonData);
    result.fetchedAt = Date.now();
    if (!rows.length)
      result.failureReason =
        Date.now() >= until ? "timeout" : "table_unavailable";
    console.log(`Season history: ${rows.length}/${options.length} seasons`);
    return result;
  } catch {
    const result = historyResult(options, available, rows);
    result.averageStats = seasonAverages(result.seasonData);
    if (!rows.length)
      result.failureReason = Date.now() >= until ? "timeout" : "fetch_failed";
    return result;
  } finally {
    clearTimeout(deadline);
    await browser.close().catch(() => {});
  }
}
