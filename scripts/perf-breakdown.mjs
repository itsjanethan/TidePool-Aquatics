// Where the tank view's update time goes, per section, plus the slowest
// frames. Needs a developer build (see perf-tank.mjs).
// node scripts/perf-breakdown.mjs [tankId] [quality] [url]
import { chromium } from 'playwright-core';
const [tankId = 'Q1', quality = 'standard', url = 'http://localhost:4175/'] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 960, height: 640 } });
await ctx.addInitScript((q) => localStorage.setItem('tidepool:quality', q), quality);
const page = await ctx.newPage();
await page.goto(`${url}?sandbox`);
await page.waitForFunction(() => window.__tidepool?.sim && window.__tidepool.game.scene.isActive('Shop'), null, { timeout: 30000 });
await page.waitForTimeout(1500);
const r = await page.evaluate(async (id) => {
  const c = window.__tidepool;
  c.ui.clear();
  c.openTankView(id);
  const frame = () => new Promise((res) => requestAnimationFrame(res));
  for (let i = 0; i < 30; i++) await frame();
  const sc = c.game.scene.getScene('Tank');
  const tr = sc.tankRenderer;
  const acc = {};
  let cur = {};
  const perFrame = [];
  const wrap = (obj, name, label) => {
    const f = obj[name].bind(obj);
    obj[name] = (...a) => { const t = performance.now(); const v = f(...a); const d = performance.now() - t; acc[label] = (acc[label] ?? []); acc[label].push(d); cur[label] = (cur[label] ?? 0) + d; return v; };
  };
  wrap(tr.lightMap, 'rebuild', 'lightMap.rebuild');
  wrap(tr.floating, 'draw', 'floating.draw');
  wrap(tr.floating, 'sync', 'floating.sync');
  wrap(tr, 'syncFish', 'syncFish');
  wrap(tr, 'drawSurface', 'drawSurface');
  const proto = Object.getPrototypeOf([...tr.agents.values()][0]);
  const fu = proto.update;
  proto.update = function (...a) { const t = performance.now(); const v = fu.apply(this, a); const d = performance.now() - t; acc.agentsTotal = (acc.agentsTotal ?? 0) + d; cur.agents = (cur.agents ?? 0) + d; return v; };
  const ov = sc.overlay ?? sc['overlay'];
  if (ov) wrap(ov, 'tick', 'overlay.tick');
  wrap(c.sim, 'advance', 'sim.advance');
  wrap(c.hud, 'update', 'hud.update');
  const total = [];
  const orig = sc.sys.sceneUpdate;
  sc.sys.sceneUpdate = function (t, d) { const t0 = performance.now(); orig.call(sc, t, d); const d2 = performance.now() - t0; total.push(d2); perFrame.push({ total: +d2.toFixed(1), ...Object.fromEntries(Object.entries(cur).map(([k, v]) => [k, +v.toFixed(1)])) }); cur = {}; };
  for (let i = 0; i < 120; i++) await frame();
  proto.update = fu;
  const sum = (xs) => xs.reduce((a, b) => a + b, 0);
  const out = { frames: total.length, updateTotal: +sum(total).toFixed(1), updateMax: +Math.max(...total).toFixed(1) };
  for (const [k, v] of Object.entries(acc)) out[k] = Array.isArray(v) ? { calls: v.length, total: +sum(v).toFixed(1), max: +Math.max(...v).toFixed(1) } : +v.toFixed(1);
  out.worst = perFrame.sort((a, b) => b.total - a.total).slice(0, 6);
  return out;
}, tankId);
console.log(JSON.stringify(r, null, 1));
await browser.close();
