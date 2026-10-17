// Offline browser regression gate. Every page/request is fulfilled locally.
// Run in Docker with --network none; never starts the Discord client or database.
import assert from "node:assert/strict";
import { launchBrowser } from "../services/browser.service";
import {
  boundedPage,
  readBrowserSeason,
} from "../services/getSeasonStats.service";
const url =
  "https://rocketleague.tracker.network/rocket-league/profile/epic/Fixture/overview";
const options = [
  { id: 38, label: "Season 24 (38)" },
  { id: 37, label: "Season 23 (37)" },
  { id: 14, label: "Season 14" },
  { id: 13, label: "Season 13" },
  { id: 12, label: "Season 12" },
  { id: 11, label: "Season 11" },
];
const row = (n: number) =>
  `<tr><td class="name"><div class="playlist">Ranked Doubles 2v2</div></td><td class="matches"><div class="value">${n}</div></td></tr>`;
const html = `<!doctype html><div id="selected" class="multi-switch__item--selected">Season 23 (37)</div>
<div class="dropdown">${options.map((o) => `<li class="dropdown__item" data-id="${o.id}"><span class="dropdown__item-label">${o.label}</span></li>`).join("")}</div>
<table class="trn-table"><tbody>${row(25)}</tbody></table>
<script>
document.querySelectorAll('li').forEach(li=>li.onclick=async()=>{
 const id=Number(li.dataset.id);
 document.querySelector('#selected').textContent=li.textContent;
 const loading=id===11?null:document.createElement('div');if(loading){loading.className='loading-indicator';document.body.append(loading);document.querySelector('tbody').innerHTML='';}
 const response=await fetch('https://api.tracker.gg/api/v2/rocket-league/standard/profile/epic/Fixture/segments/playlist?season='+id,{headers:{'X-Fixture':'test'}});
 await response.json();
 // The response is complete before the DOM commits. No fixed frame count is enough.
 await new Promise(r=>setTimeout(r,id===37?5000:850));
 document.querySelector('tbody').innerHTML=id<=13?'':${JSON.stringify(row(50))};loading?.remove();
});
</script>`;
const browser = await launchBrowser();
let preflights = 0,
  gets = 0,
  unexpected = 0;
try {
  const page = await browser.newPage();
  await page.setRequestInterception(true);
  page.on("request", (request: any) => {
    if (request.url() === url)
      return void request.respond({
        status: 200,
        contentType: "text/html",
        body: html,
      });
    if (
      request
        .url()
        .startsWith(
          "https://api.tracker.gg/api/v2/rocket-league/standard/profile/epic/Fixture/segments/playlist?",
        )
    ) {
      const headers = {
        "Access-Control-Allow-Origin": "https://rocketleague.tracker.network",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "X-Fixture",
      };
      if (request.method() === "OPTIONS") {
        preflights++;
        return void request.respond({ status: 204, headers });
      }
      gets++;
      return void request.respond({
        status: 200,
        contentType: "application/json",
        headers,
        body: "{}",
      });
    }
    if (!request.url().endsWith("/favicon.ico")) unexpected++;
    void request.abort();
  });
  await page.goto(url, { waitUntil: "domcontentloaded" });
  const started = Date.now();
  const first = await boundedPage(
    page,
    () => readBrowserSeason(page, options[0], "epic", "Fixture", true),
    6000,
  );
  assert.equal(first.seasonId, 38);
  assert.equal(first.totalMatches, 50);
  assert(Date.now() - started >= 800);
  const identical = await boundedPage(
    page,
    () => readBrowserSeason(page, options[2], "epic", "Fixture", true),
    6000,
  );
  assert.equal(identical.seasonId, 14);
  assert.equal(identical.totalMatches, 50);
  for (const option of options.slice(3)) {
    const empty = await boundedPage(
      page,
      () => readBrowserSeason(page, option, "epic", "Fixture", true),
      6000,
    );
    assert.equal(empty.unavailable, true);
    assert.equal(empty.totalMatches, null);
  }
  assert(gets >= 2);
  assert(preflights >= 2);
  await assert.rejects(
    boundedPage(
      page,
      () => readBrowserSeason(page, options[1], "epic", "Fixture", true),
      1000,
    ),
    /deadline/,
  );
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(page.isClosed(), true);
  assert.equal(unexpected, 0);
  console.log(
    JSON.stringify({
      offlineBrowserChecks: 5,
      delayedDomCommit: true,
      identicalTables: true,
      firstSelectedVerified: true,
      preflightsIgnored: preflights,
      completedGets: gets,
      timeoutClosedDocument: true,
      unexpectedRequests: unexpected,
    }),
  );
} finally {
  await browser.close().catch(() => {});
}
