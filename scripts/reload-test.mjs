// Verifies saves persist across a page reload (same browser profile).
import { chromium } from 'playwright-core';
const exe = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const url = process.argv[2] ?? 'http://localhost:5173/';
const ctx = await chromium.launchPersistentContext('/tmp/claude-0/pw-profile-' + Date.now(), { executablePath: exe, viewport: { width: 960, height: 640 }, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(url);
await page.waitForTimeout(1500);
await page.keyboard.press('Enter');
await page.waitForTimeout(300);
await page.keyboard.type('Saver');
await page.keyboard.press('Enter');
await page.keyboard.press('Enter');
await page.waitForTimeout(1000);
for (let i = 0; i < 6; i++) { await page.keyboard.press('x'); await page.waitForTimeout(150); }
const before = await page.evaluate(async () => {
  const c = window.__tidepool;
  c.sim.advance(200);
  c.state.money = 1234.5;
  await c.save('slot2');
  return { minute: c.state.minute, money: c.state.money, fish: Object.keys(c.state.fish).length, name: c.state.playerName };
});
await page.reload();
await page.waitForTimeout(2000);
await page.screenshot({ path: 'scratch/shots/title-continue.png' });
await page.keyboard.press('Enter'); // Continue
await page.waitForTimeout(1500);
const after = await page.evaluate(() => {
  const c = window.__tidepool;
  return { minute: c.state.minute, money: c.state.money, fish: Object.keys(c.state.fish).length, name: c.state.playerName, inGame: c.inGame };
});
console.log(JSON.stringify({ before, after, errors }));
await ctx.close();
