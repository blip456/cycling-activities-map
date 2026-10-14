/**
 * One toolbar button, routed by site:
 *
 * - strava.com    → strava.js: activities + GPS streams. Runs in the page's own
 *   ("MAIN") world so requests to Strava are same-origin and your session
 *   cookie applies untouched, and because a page outlives the service worker,
 *   which Chrome is free to shut down mid-sync.
 * - squadrats.com → squadrats.js: your visited tiles. It needs nothing from the
 *   page, so it runs in the extension's isolated world, where the page's
 *   Content-Security-Policy can't block the request to localhost.
 *
 * Anywhere else it opens Strava.
 */
const SCRIPTS = [
  { match: /^https:\/\/www\.strava\.com\//, file: "strava.js", world: "MAIN" },
  { match: /^https:\/\/([a-z0-9-]+\.)?squadrats\.com\//, file: "squadrats.js", world: "ISOLATED" },
];

chrome.action.onClicked.addListener(async (tab) => {
  const script = SCRIPTS.find((s) => tab.url && s.match.test(tab.url));

  if (!script) {
    await chrome.tabs.create({ url: "https://www.strava.com/athlete/training" });
    return;
  }

  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: [script.file],
    world: script.world,
  });
});
