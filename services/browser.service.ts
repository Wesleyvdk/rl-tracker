import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { getRandomProxy } from "./proxy.service";

puppeteer.use(StealthPlugin());

export async function launchBrowser() {
    const proxy = await getRandomProxy();
    const args = [
        "--disable-blink-features=AutomationControlled",
        "--no-sandbox",
        "--disable-dev-shm-usage",
    ];

    /*
    if (proxy) {
        console.log(`[PROXY] Launching transient Puppeteer with proxy: ${proxy}`);
        args.push(`--proxy-server=${proxy}`);
    }
    */

    const browser = await puppeteer.launch({
        headless: "new" as any,
        protocolTimeout: 600000,
        args,
    });

    return browser;
}
