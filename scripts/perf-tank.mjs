// Tank view profiler (headless Chromium). Needs a developer build served
// somewhere (npm run build:sandbox, then serve dist-sandbox/), because it
// drives the game through the developer-only window.__tidepool hook.
//
// node scripts/perf-tank.mjs <url> <out.json> [quality,...] [seconds]
//
// For each viewport (desktop 960x640 at DPR 1, phone 390x844 at DPR 2) and
// tank (ordinary A1, densely planted M6, population-cap Q1) it records:
//   open: time from openTankView to the first rendered frame (ms)
//   stall: longest frame and frames over 50 ms in the first 3 s (texture painting)
//   steady: frame-time mean / p50 / p95 / p99 / max and frames over 33.3 ms
//   memory: JS heap (MB), texture count, texture pixels (MP), fish sheets
// Headless Chromium renders WebGL on the CPU (SwiftShader), so absolute
// numbers are pessimistic and only comparisons between runs are meaningful.
import { chromium } from 'playwright-core';
import { writeFileSync } from 'node:fs';

const [url = 'http://localhost:4175/', out = 'perf.json', qualities = 'standard', secs = '8'] = process.argv.slice(2);
const exe = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({
  executablePath: exe,
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--enable-precise-memory-info', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'],
});
const VIEWPORTS = [
  { name: 'desktop', width: 960, height: 640, dpr: 1, mobile: false },
  { name: 'phone', width: 390, height: 844, dpr: 2, mobile: true },
];
const TANKS = [
  { id: 'A1', label: 'ordinary' },
  { id: 'M6', label: 'densely planted' },
  { id: 'Q1', label: 'population cap' },
].filter((t) => !process.env.TANKS || process.env.TANKS.split(',').includes(t.id));
// Longest wait for every sheet to be painted before measuring (SETTLE_MS, default 40 s).
const SETTLE_MS = Number(process.env.SETTLE_MS ?? 40000);
const stats = (xs) => {
  if (!xs.length) return { frames: 0, mean: 0, p50: 0, p95: 0, p99: 0, max: 0, slow: 0 };
  const s = [...xs].sort((a, b) => a - b);
  const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  const mean = s.reduce((a, b) => a + b, 0) / s.length;
  return { frames: s.length, mean: +mean.toFixed(2), p50: +q(0.5).toFixed(2), p95: +q(0.95).toFixed(2), p99: +q(0.99).toFixed(2), max: +s[s.length - 1].toFixed(2), slow: s.filter((x) => x > 33.4).length };
};

const results = [];
for (const quality of qualities.split(',')) {
  for (const vp of VIEWPORTS) {
    for (const tank of TANKS) {
      const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: vp.dpr, isMobile: vp.mobile, hasTouch: vp.mobile });
      await ctx.addInitScript((q) => {
        try {
          localStorage.setItem('tidepool:quality', q);
        } catch {
          /* ignore */
        }
      }, quality);
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto(`${url}?sandbox`);
      await page.waitForFunction(() => window.__tidepool?.sim && window.__tidepool.game.scene.isActive('Shop'), null, { timeout: 30000 });
      await page.waitForTimeout(1500);
      const r = await page.evaluate(
        async ({ id, secs, settleCap }) => {
          const c = window.__tidepool;
          c.ui.clear();
          // Keep staff proposals and customers from opening dialogues mid-measurement.
          c.state.settings.speed = 1;
          const frame = () => new Promise((res) => requestAnimationFrame(res));
          await frame();
          await frame();
          const t0 = performance.now();
          c.openTankView(id);
          let firstFrame = null;
          const early = [];
          let last = performance.now();
          while (performance.now() - t0 < 3000) {
            await frame();
            const now = performance.now();
            if (firstFrame === null && c.game.scene.isActive('Tank')) firstFrame = now - t0;
            early.push(now - last);
            last = now;
          }
          // Settle: wait until every animal has its painted sheet (sprites become visible
          // once painted) plus one second, at most SETTLE_MS, so painting is not counted as
          // steady-state cost. Reported as settleMs.
          const s0 = performance.now();
          const sceneS = c.game.scene.getScene('Tank');
          while (performance.now() - s0 < settleCap) {
            const agents = [...sceneS.tankRenderer.agents.values()];
            if (agents.every((a) => a.sprite.visible)) break;
            await frame();
          }
          const settleMs = performance.now() - s0;
          const s1 = performance.now();
          while (performance.now() - s1 < 1000) await frame();
          // Steady state. Also time our update (JS) and the renderer (WebGL submit; on
          // SwiftShader this includes rasterising, so it tracks fill and draw calls).
          const scene0 = c.game.scene.getScene('Tank');
          const upd = [];
          const ren = [];
          // Phaser calls sys.sceneUpdate (a reference taken at scene start).
          const origUpdate = scene0.sys.sceneUpdate;
          scene0.sys.sceneUpdate = function (t, d) {
            const u0 = performance.now();
            origUpdate.call(scene0, t, d);
            upd.push(performance.now() - u0);
          };
          let r0 = 0;
          const onPre = () => (r0 = performance.now());
          const onPost = () => ren.push(performance.now() - r0);
          c.game.events.on('prerender', onPre);
          c.game.events.on('postrender', onPost);
          const deltas = [];
          last = performance.now();
          const end = last + secs * 1000;
          while (performance.now() < end) {
            await frame();
            const now = performance.now();
            deltas.push(now - last);
            last = now;
            if (c.ui.top() && !c.ui.top().el.classList.contains('tank-view-ui')) c.ui.remove(c.ui.top());
          }
          c.game.events.off('prerender', onPre);
          c.game.events.off('postrender', onPost);
          scene0.sys.sceneUpdate = origUpdate;
          const tex = c.game.textures.list;
          let pixels = 0;
          let fishSheets = 0;
          for (const k of Object.keys(tex)) {
            const src = tex[k].source?.[0];
            if (src) pixels += (src.width || 0) * (src.height || 0);
            if (k.startsWith('fish2:')) fishSheets++;
          }
          const scene = c.game.scene.getScene('Tank');
          return {
            fish: scene.tankRenderer.agents.size,
            decor: c.state.tanks[id].decor.length,
            canvas: [c.game.scale.width, c.game.scale.height],
            openMs: +(firstFrame ?? -1).toFixed(1),
            settleMs: +settleMs.toFixed(0),
            stallMaxMs: +Math.max(...early).toFixed(1),
            stallFramesOver50: early.filter((x) => x > 50).length,
            steady: deltas,
            update: upd,
            render: ren,
            heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null,
            textures: Object.keys(tex).length,
            textureMP: +(pixels / 1e6).toFixed(2),
            fishSheets,
            displayObjects: scene.children.list.length,
          };
        },
        { id: tank.id, secs: Number(secs), settleCap: SETTLE_MS },
      );
      const row = { quality, viewport: vp.name, tank: tank.id, kind: tank.label, ...r, steady: stats(r.steady), update: stats(r.update), render: stats(r.render), errors };
      results.push(row);
      const s = row.steady;
      console.log(
        `${quality.padEnd(8)} ${vp.name.padEnd(7)} ${tank.id} ${tank.label.padEnd(15)} fish ${String(row.fish).padStart(2)} open ${row.openMs}ms settle ${row.settleMs}ms | frame ${s.mean}/${s.p95} | update ${row.update.mean}/${row.update.p50}/${row.update.p95}/${row.update.max} | render ${row.render.mean}/${row.render.p95} | heap ${row.heapMB}MB tex ${row.textures} (${row.textureMP}MP) objs ${row.displayObjects}${errors.length ? ' ERR ' + errors.join('|') : ''}`,
      );
      await ctx.close();
    }
  }
}
writeFileSync(out, JSON.stringify({ when: new Date().toISOString(), url, note: 'Headless Chromium, SwiftShader (CPU) WebGL. Compare runs, not absolute values.', results }, null, 2));
await browser.close();
