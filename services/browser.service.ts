import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

puppeteer.use(StealthPlugin());

const activeBrowsers = new Set<any>();
let stopping = false;
export async function shutdownBrowsers() {
  stopping = true;
  await Promise.allSettled(
    [...activeBrowsers].map((browser) => browser.close()),
  );
}

export async function launchBrowser() {
  if (stopping) throw new Error("Browser service is shutting down");
  const args = [
    "--disable-blink-features=AutomationControlled",
    "--no-sandbox",
    "--disable-dev-shm-usage",
  ];

  const browser = await puppeteer.launch({
    headless: true,
    protocolTimeout: 30000,
    args,
  });

  activeBrowsers.add(browser);
  browser.once("disconnected", () => activeBrowsers.delete(browser));
  return browser;
}
