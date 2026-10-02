// Quick screenshot harness: node scripts/shot.mjs <url> <out.png> [steps json]
import { chromium } from 'playwright-core';
const [url, out, stepsJson] = process.argv.slice(2);
const exe = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({ executablePath: exe, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 960, height: 640 } });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack}`));
await page.goto(url);
await page.waitForTimeout(1500);
const steps = stepsJson ? JSON.parse(stepsJson) : [];
let n = 0;
for (const st of steps) {
  if (st.key) { await page.keyboard.down(st.key); await page.waitForTimeout(st.hold ?? 60); await page.keyboard.up(st.key); }
  if (st.type) await page.keyboard.type(st.type);
  if (st.eval) { const r = await page.evaluate(st.eval); if (r !== undefined) logs.push(`[eval] ${JSON.stringify(r)}`); }
  if (st.wait) await page.waitForTimeout(st.wait);
  if (st.shot) await page.screenshot({ path: st.shot });
  n++;
}
await page.waitForTimeout(300);
await page.screenshot({ path: out });
console.log(logs.join('\n'));
await browser.close();
