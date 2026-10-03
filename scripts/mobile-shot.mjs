// Mobile-emulation screenshot harness (Chromium device emulation, not a real device).
// node scripts/mobile-shot.mjs <url> <out.png> <width>x<height> [steps json]
// Steps: {wait}, {eval}, {shot}, {rotate:"WxH"}, {tap:"css selector"}
import { chromium } from 'playwright-core';
const [url, out, size = '390x844', stepsJson] = process.argv.slice(2);
const [w, hgt] = size.split('x').map(Number);
const exe = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({ executablePath: exe, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: w, height: hgt }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack}`));
await page.goto(url);
await page.waitForTimeout(1500);
for (const st of stepsJson ? JSON.parse(stepsJson) : []) {
  if (st.rotate) { const [rw, rh] = st.rotate.split('x').map(Number); await page.setViewportSize({ width: rw, height: rh }); }
  if (st.tap) await page.tap(st.tap);
  if (st.eval) { const r = await page.evaluate(st.eval); if (r !== undefined) logs.push(`[eval] ${JSON.stringify(r)}`); }
  if (st.wait) await page.waitForTimeout(st.wait);
  if (st.shot) await page.screenshot({ path: st.shot });
}
await page.waitForTimeout(300);
await page.screenshot({ path: out });
console.log(logs.join('\n'));
await browser.close();
