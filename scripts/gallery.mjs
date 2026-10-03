// Headless morph gallery screenshot for art/genetics checks.
// Usage: npx vite --port 5173 &  then  node scripts/gallery.mjs <speciesId> out.png [height]
import { chromium } from 'playwright-core';
const [species = 'guppy', out = 'gallery.png', height = '1400'] = process.argv.slice(2);
const exe = process.env.CHROME ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({ executablePath: exe, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1300, height: Number(height) } });
page.on('pageerror', (e) => console.error(e.message));
await page.goto(`http://localhost:5173/#gallery=${species}`);
await page.waitForTimeout(3000);
await page.screenshot({ path: out });
await browser.close();
