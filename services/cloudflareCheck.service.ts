/**
 * Detects whether the current page is a Cloudflare challenge/verification page.
 */
export async function isCloudflareChallenge(page: any): Promise<boolean> {
  return await page.evaluate(() => {
    const title = document.title.toLowerCase();
    if (
      title.includes("just a moment") ||
      title.includes("attention required") ||
      title.includes("cloudflare")
    ) {
      return true;
    }

    // Common CF challenge selectors
    const cfSelectors = [
      "#challenge-running",
      "#challenge-form",
      "#challenge-stage",
      ".cf-browser-verification",
      "#cf-challenge-running",
      "#turnstile-wrapper",
      'iframe[src*="challenges.cloudflare.com"]',
    ];

    for (const sel of cfSelectors) {
      if (document.querySelector(sel)) return true;
    }

    // Check for CF "checking your browser" text
    const bodyText = document.body?.innerText || "";
    if (
      bodyText.includes("Checking if the site connection is secure") ||
      bodyText.includes("Verify you are human") ||
      bodyText.includes("Enable JavaScript and cookies to continue")
    ) {
      return true;
    }

    return false;
  });
}
