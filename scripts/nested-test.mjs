// Loads a built copy of the game from a nested URL path and checks it boots,
// starts a new game, registers the service worker and logs no errors.
// Usage: node scripts/nested-test.mjs http://localhost:8099/tidepool-aquatics/
import { chromium } from 'playwright-core';
const url = process.argv[2];
const exe = process.env.CHROME ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({ executablePath: exe, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 960, height: 640 } });
const errors = [];
const failed = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('requestfailed', (r) => failed.push(r.url()));
page.on('response', (r) => r.status() >= 400 && failed.push(`${r.status()} ${r.url()}`));
await page.goto(url);
await page.waitForTimeout(3000);
const title = await page.evaluate(() => document.body.innerText.includes('Tidepool Aquatics') && document.body.innerText.includes('v0.4.0'));
await page.keyboard.press('Enter');
await page.waitForTimeout(500);
await page.keyboard.type('Nested');
await page.keyboard.press('Enter');
await page.waitForTimeout(200);
await page.keyboard.press('Enter');
await page.waitForTimeout(1500);
const inGame = await page.evaluate(() => !!document.querySelector('.hud') && getComputedStyle(document.querySelector('.hud')).display !== 'none');
const sw = await page.evaluate(async () => {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return 'unsupported';
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    return reg ? reg.scope : 'none';
  } catch {
    return 'unsupported';
  }
});
await page.screenshot({ path: 'scratch/shots/nested.png' });
console.log(JSON.stringify({ url, title, inGame, sw, errors, failed }, null, 1));
await browser.close();
process.exit(title && inGame && !errors.length && !failed.length ? 0 : 1);
