# Testing

## Commands

```bash
npm run typecheck   # tsc --noEmit (strict)
npm run lint        # eslint src tests
npm test            # vitest unit + simulation tests (node, no browser)
npm run build       # production build to dist/
npm run check       # all of the above, in order. Must pass before a task is done.
```

## Automated tests (`tests/`)

| File | Covers |
| --- | --- |
| `water.test.ts` | Fish-in cycling produces ammonia then nitrite spikes and completes; mature tanks stay stable for a week; overfeeding pollutes; water changes dilute |
| `fish.test.ts` | Species data consistency; growth depends on feeding; eating; shoaling stress; advice suitability; value |
| `customers.test.ts` | Full buy flow (browse, reserve, queue, sale); good and bad advice; arrivals over a day |
| `save.test.ts` | Round trip; rejects future and garbage saves; IndexedDB storage (fake-indexeddb); determinism after reload |
| `balance.test.ts` | A near-perfect bot runs the shop for 21 days: must stay solvent, serve 100+ customers, keep fish alive and improve reputation |
| `plants.test.ts` | Plant growth, cuttings, trimming, stockroom, replanting, plant sales to customers and trade, substrate ownership, multi-tank orders, v1 save migration |
| `breeding.test.ts` | Genetics (dominance, recessive ratios, every morph reachable), livebearer births with parents, cave and plant needs, egg broods and cover, strains and value |
| `order.test.ts` | Order warnings: uncycled tanks, temperature, projected stocking across lines, goldfish with tiny fish, clean orders have no warnings |
| `menu.test.ts` | (happy-dom) Menu selection and wrapping, headers, disabled rows, refresh, resting mouse, nested screen stack, dialogue choices, capped key repeat, typing in text boxes |
| `phenotype.test.ts` | Morphs and traits change looks; albino; male-only tails hidden in females and fry; additive metallic; fry develop; gravid belly paints fuller; siblings differ; painter fills every frame; turn frames narrower; every species paints under 400 ms |
| `floating.test.ts` | Duckweed spreads to carpet the surface; cover shades plants, soaks up nitrate, adds fry cover; scoop to stockroom, move, sell, bin |
| `longrun.test.ts` | 30, 100 and 365 day bot runs with breeding tanks; a 100-day level 4 run with staff; a 100-day staff-only run; invariants checked (see below) |
| `diagnostics.test.ts` | Starter shop reports sensibly and in severity order; dead fish are "dead", a sick fish in clean water is never "toxic", toxic water carries its value, hunger, glass and algae numbers; every fix's preview equals the real action exactly; cover % per species; cave spaces per adult cave dweller |
| `idle.test.ts` | Idle Mode freezes clock, fish, water, growth, pregnancies, customers, staff, wages and rng across days and end-of-day; resumes afterwards; every transaction refused with the Idle Mode message; previews do not mutate; saves exclude the flag and loads resume normal play; staff stand still |
| `floors.test.ts` | Floor registry (unique tank ids, reciprocal stairs, every prop reachable by staff and customers), routes between floors, v2 to v3 save migration, round trip with every floor, expansion requirements and unlocks, a customer walking upstairs and back out of the door |
| `staff.test.ts` | Applicants and wages, wages charged nightly, diagnostics-based job priority, a worker really cleaning a tank, sales staff serving the till, stock proposals from real stock costing nothing until approved, aquascape proposals predicting the real effect, slow skill growth, dismissal, off-duty hours, taking the stairs to an upstairs job, floor assignment, save/load of staff and suggestions, knowledge vs suggestion quality (seeded), no spending without approval over a working day |
| `input.test.ts` | (happy-dom) Run pace is exactly twice walking and grid-only; Shift, keyboard X and on-screen B count as run; B still closes menus; blur, pagehide and a hidden tab release keyboard, touch and gamepad holds (a gamepad button still down is re-adopted without a fresh Back press); two-finger d-pad plus B; d-pad slide changes direction; pointercancel, lost capture and a lift outside the controls release; contextual B label (Run / Back); the "Hold B to run" hint retires after the first run |
| `layout.test.ts` | (happy-dom) Layout at 390x844 and 844x390 (controls below / beside, no overlap), safe areas, immersive and desktop modes, tiny-screen fallback; UI unit keeps text at 18 px and follows text size; backing-pixel cap; store camera closer than the whole floor on phones and whole floor at 960x640; clamped follow; labels follow the camera; tap-to-move paths (4-way, around obstacles, to a prop's interaction tile facing it, every interactable prop on every floor reachable); display preferences defaults, persistence and bad data |
| `protection.test.ts` | Not for sale: protected fish are never sellable, browsing and advice customers never reserve them, protecting a reserved fish releases it and updates the order, a queueing customer left with nothing walks out (not a lost sale), `completeSale` keeps a protected fish even if one reaches a basket and refunds its price, the trade buyer refuses them; bulk results and repeat calls; protection survives moves, save and export/import, older saves load unprotected; protected fish still breed and their fry are for sale |
| `tapguard.test.ts` | (happy-dom) No double-tap zoom from the controls: every touch gesture on them is cancelled and ghost clicks never reach the page; rapid taps on B give exactly one press each and B plus a direction still runs; rotation releases held buttons; on the game area and menus a single tap is untouched, a quick second tap is cancelled and its click delivered exactly once, slow taps, swipes (list scrolling) and text fields are left alone, the canvas gets no synthetic click |
| `visuals.test.ts` | (happy-dom) Quality levels never add work at lower levels; Auto steps down after a sustained slow window, ignores the opening seconds and short hitches, never steps up, only in Auto; bounded texture caches keep recent textures and never drop the one in use; reduced motion follows the setting or the device; each new effect follows tank state (mulm with detritus, film needs dirt and a still surface, only healthy lit fed plants pearl, hardscape shade and algae, light ramp) |
| `marine_retail.test.ts` | Salinity evaporation and RO top-off, salt-mix water changes, SG display, freshwater/marine separation, salinity damage; retail stock space, an equipment customer visiting the basement and paying, bundle preference, bundle stock and margin, equipment advice (right vs plausible wrong), marine kit gated; every species and morph paints a full sheet |

### Long-run simulation

Maintenance validation on 2026-10-03: Node 22.23.3, clean `npm ci`, `BASE_PATH=/TidePool-Aquatics/ npm run check` passed (17 files, 120 tests, production build; suite duration 87.24 seconds on Windows). Pages run 37124004146 previously failed only because the 30-day test took 5.154 seconds against the default five-second timeout. That test now allows 30 seconds, with unchanged seed, days and assertions. Repository checks validates PRs before a main-branch deployment.

`tests/helpers/bot.ts` plays the shop: feeds, maintains, serves, restocks from suppliers, takes cuttings, keeps three tanks (A1 guppies, A5, B1) as breeding tanks (not for sale) and sells surplus to the trade buyer. Every simulated day the test checks: no negative money spiral, no NaN anywhere in water or fish, no negative stock or storage counts, no duplicate or colliding ids, every live fish in an existing tank, tank populations under the cap, pregnancies and broods referring to existing parents, order queue bounded, fry with valid parents.

Run with output: `npx vitest run tests/longrun.test.ts --silent=false`.

Results on 2026-10-03 (seeded, v0.2.0):

| Run | Money (start £400) | Revenue | Customers | Fish bred | Fry eaten | Deaths | Fish records | Save size | Runtime |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 30 days | £1,060 | £2,135 | 204 | 50 | 11 | 0 | 90 | 111 KB | 1.8 s |
| 100 days | £1,379 | £5,913 | 552 | 69 | 16 | 15 | 90 | 121 KB | 4.9 s |
| 365 days | £5,037 | £24,472 | 2,234 | 153 | 36 | 56 | 175 | 186 KB | 20.6 s |

Balance notes:

- Money grows steadily but slowly (roughly £10 to £15 a day for the bot once established). Income is supply limited: the bot only stocks what suppliers carry, and demand saturation keeps one species from carrying the shop. Human playtests should judge whether mid-game feels too slow; levers are rent (`DAILY_RENT`), demand recovery (`recoverDemand`) and customer rate (`perHour` in `customers.ts`).
- Breeding income is real but not dominant (about 150 bred fish a year from three tanks). Strain bonuses are capped and quality regresses toward the mean, so there is no infinite-money loop; the trade buyer pays 35% of shop value.
- Populations stay bounded (largest tank 23 to 24 fish; cap 70). Save size grows slowly (fish records of sold fish are deleted unless they are parents).
- Maintenance load: the bot does about 2 to 3 chores per tank per week to keep water clean, which matches the intended routine.
- Earlier issue fixed: customer profiles grew without limit (446 after a year, 1 MB saves). Now capped at 80.

Results on 2026-10-03 (v0.4.0):

| Run | Money | Revenue | Customers | Fish bred | Deaths | Fish records | Save size | Runtime |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 30 days | £1,273 | £2,400 | 218 | 66 | 0 | 122 | 141 KB | 2.3 s |
| 100 days | £2,358 | £7,282 | 644 | 102 | 21 | 133 | 161 KB | 6.1 s |
| 365 days | £7,897 | £28,145 | 2,417 | 198 | 76 | 201 | 214 KB | 28 s |
| Level 4, 2 staff, 100 days (start £2,500) | £9,547 | £27,783 | 1,523 | 83 | 28 | 135 | 194 KB | 12.5 s |

- A played level 4 shop with two staff earns roughly three times a level 1 shop, after wages and the extra rent.
- The staff-only run (no player, suggestions approved each morning) is a robustness test: staff keep tanks maintained and serve customers for 100 days without errors, but without a player buying stock a level 4 shop does not pay its way. That is intended: staff help, the player still runs the business.

Simulation code is pure, so prefer adding tests at the `sim/` level. If you change balance numbers, run `npx vitest run tests/balance.test.ts --silent=false` and read the printed summary.

## Browser checks

`scripts/shot.mjs` drives the real game in headless Chromium and takes screenshots:

```bash
npx vite --port 5173 &
node scripts/shot.mjs http://localhost:5173/ out.png '[{"key":"Enter","wait":400},{"type":"Tester"},{"key":"Enter"},{"key":"Enter","wait":1200}]'
```

Steps support `key` (press), `type` (text), `eval` (JS in page; result printed), `wait` (ms) and `shot` (screenshot path). In developer builds (`npm run dev` / `npm run sandbox`; never the public build), `window.__tidepool` exposes the GameController for scripted checks (for example teleporting the player or reading state).

`scripts/gallery.mjs <species> out.png` screenshots the developer morph gallery (every morph and single-trait variant by sex and life stage, and the 11-frame swim/turn strip). Open `#gallery=<species>` in a browser for the same view; Left/Right switches species.

`scripts/reload-test.mjs` verifies that a save survives a page reload in a persistent browser profile.

`scripts/nested-test.mjs <url>` loads a built copy from a nested path (for example `BASE_PATH=/tidepool-aquatics/ npx vite build --outDir /tmp/site/tidepool-aquatics`, then serve `/tmp/site` and open `http://localhost:8099/tidepool-aquatics/`). It fails on any console error, failed request, missing title or version, a new game that does not start, and reports the service worker scope. Verified on 2026-10-03 for an absolute base (`/tidepool-aquatics/`) and a relative build under `/games/deep/tp/`.

Chromium lives at `/opt/pw-browsers/chromium-1194/chrome-linux/chrome` in the agent sandbox; adjust `exe` elsewhere.

## Mobile checks (emulated)

`node scripts/mobile-check.mjs http://localhost:5173/ <outdir>` (needs `npm run dev`) runs Chromium phone emulation (touch, DPR 2) at 390x844 and 844x390 and reports PASS/FAIL for: game rectangle inside the viewport, controls beside or below the game and not over it, touch targets of 44 px or more, no page scroll, smallest UI text 16 px or more, menu lists pan vertically, tap to move reaching a tank or floor tile, the camera following the player closer than the whole floor, world labels tracking the camera, interrupted touches clearing held input, map view showing the whole floor, rotation relayout, and typing in the New Game form with the layout held while the keyboard is up. It saves screenshots. This is emulation: real-device behaviour (iOS Safari bars, real keyboards, notches, performance) still needs a phone. `scripts/mobile-shot.mjs` takes single emulated screenshots.

## Rapid taps and page zoom (emulated)

`node scripts/tap-zoom-check.mjs "http://localhost:5173/?sandbox"` (needs `npm run dev`) sends real touch sequences through the DevTools protocol at B, A, the d-pad, the menu button, the gap between buttons, the game area, the HUD Map button and a pause-menu arrow, in portrait (390x844) and landscape (844x390). It checks each tap gives exactly one action or click, that every touchend within 500 ms of the previous one is cancelled (a cancelled touchend cannot start a double-tap zoom), and that rotating while holding B and a direction releases both.

**Limits.** Headless and headed Chromium in this environment never perform double-tap or pinch zoom themselves (checked on a plain page), so the zoom itself cannot be observed here, only the mechanism that prevents it. Taps arrive 300 to 500 ms apart because the emulator renders slowly. Not yet checked on a real iPhone or Android phone.

## Tank view profiling

Tools (need a developer build, because they drive the game through the developer-only hook): `npm run build:sandbox`, serve `dist-sandbox/` (for example `python3 -m http.server 4175` inside it), then:

- `node scripts/perf-tank.mjs http://localhost:4175/ out.json low,standard,high 8`: desktop 960x640 (DPR 1) and phone 390x844 (DPR 2) on an ordinary tank (A1), a densely planted tank (M6) and a tank at the population cap (Q1, 70 fish). Records open time, frame time, our update time (JS), renderer submit time, heap, texture count and pixels.
- `node scripts/perf-tour.mjs http://localhost:4175/ 2`: opens every tank twice and reports heap and texture counts (bounded caches).
- `node scripts/perf-breakdown.mjs Q1 standard http://localhost:4175/`: update time per section and the slowest frames.

**Limits.** These run in headless Chromium with SwiftShader, which rasterises WebGL on the CPU (two cores here). Whole-frame times (100 to 200 ms) are dominated by that software rasteriser and say nothing about a phone or a desktop GPU; every frame counts as "slow" there, so slow-frame counts are not meaningful. Our own CPU costs (update, renderer submit) and memory are meaningful as before/after comparisons on the same machine. p95 and heap are noisy between runs (shared CPU, GC timing). No real-device measurements were made.

### Aquarium visuals pass (2026-10-03), before → after

Same machine, same builds apart from this change, 8-second steady windows.

| Quality | Viewport | Tank (fish) | Update mean ms | Update p95 ms | Render submit ms | Open ms | Textures |
|---|---|---|---|---|---|---|---|
| low | desktop | A1 ordinary (7) | 1.07 → 1.01 | 2 → 2.4 | 1.52 → 1.54 | 176 → 177 | 84 → 82 |
| low | desktop | M6 densely planted (23) | 2.21 → 2.14 | 4.1 → 4.4 | 4.15 → 4.89 | 150 → 171 | 96 → 98 |
| low | desktop | Q1 population cap (70) | 6.91 → 7.02 | 20.9 → 24.1 | 8.12 → 8.94 | 138 → 161 | 146 → 147 |
| low | phone | A1 ordinary (7) | 1.12 → 1.05 | 2.2 → 2.2 | 1.46 → 1.47 | 218 → 220 | 82 → 84 |
| low | phone | M6 densely planted (23) | 2.1 → 1.63 | 4.9 → 3 | 4.03 → 4.27 | 182 → 186 | 100 → 101 |
| low | phone | Q1 population cap (70) | 4.48 → 3.73 | 8.6 → 10.1 | 7.92 → 8.02 | 174 → 187 | 146 → 148 |
| standard | desktop | A1 ordinary (7) | 1.52 → 1.06 | 2.6 → 2.8 | 1.76 → 1.62 | 198 → 179 | 80 → 81 |
| standard | desktop | M6 densely planted (23) | 4.23 → 2.42 | 6.2 → 4.1 | 5.23 → 4.94 | 168 → 145 | 98 → 101 |
| standard | desktop | Q1 population cap (70) | 10.39 → 6.99 | 22.5 → 25.1 | 8.3 → 8.68 | 176 → 152 | 143 → 148 |
| standard | phone | A1 ordinary (7) | 1.43 → 1.03 | 2.4 → 2 | 1.57 → 1.61 | 204 → 200 | 82 → 85 |
| standard | phone | M6 densely planted (23) | 3.67 → 2.3 | 6.6 → 4.5 | 4.52 → 4.62 | 211 → 209 | 99 → 101 |
| standard | phone | Q1 population cap (70) | 7.09 → 6.08 | 19.6 → 23.2 | 7.9 → 9.01 | 226 → 180 | 145 → 149 |
| high | desktop | A1 ordinary (7) | 1.41 → 1.47 | 2.6 → 3.4 | 1.53 → 1.64 | 164 → 175 | 82 → 85 |
| high | desktop | M6 densely planted (23) | 3.84 → 4.18 | 6.5 → 8.3 | 4.65 → 4.9 | 192 → 171 | 96 → 100 |
| high | desktop | Q1 population cap (70) | 10.2 → 10.03 | 24.2 → 22.1 | 8.21 → 8.4 | 157 → 184 | 143 → 148 |
| high | phone | A1 ordinary (7) | 1.4 → 1.35 | 2.6 → 2.5 | 1.64 → 1.49 | 220 → 220 | 84 → 85 |
| high | phone | M6 densely planted (23) | 3.46 → 3.71 | 5.8 → 6.4 | 4.53 → 4.67 | 206 → 220 | 98 → 100 |
| high | phone | Q1 population cap (70) | 7.44 → 8.61 | 19.4 → 26.8 | 8.42 → 8.49 | 210 → 216 | 145 → 147 |


Summary: at Standard (the level Auto starts at), mean update time fell 30 to 43% on the planted and capped tanks (plants now redraw at 30 Hz in staggered buckets) while adding pearling, mulm, surface film, hardscape shading and the light ramp. High adds reflections and more pearls for roughly the old High cost. Renderer submit and open time are unchanged within noise. Tour (24 tanks, twice): substrate textures held 24 before, now capped at 6 (plus 6 mulm); heap stays about 70 MB.

## Developer Sandbox

`npm run sandbox` (or the "Developer Sandbox" item on the title screen of a developer build) starts `createSandbox()` from `src/dev/sandbox.ts`: seed 4242, all floors bought through `buyExpansion`, every tank matured, empty expansion tanks stocked, five presets applied (planted M6, breeding Q2, coldwater U5, marine M1, performance Q1 at 70 fish), four staff hired through `hireApplicant`, £100,000, 8 of every retail item, 30 of every dry good, every decor item and potted plant in the stockroom, and every species in supplier stock. It is byte-identical every time (tested). `tests/devsandbox.test.ts` covers determinism, unlocks, healthy tanks over three simulated days, preset rules, and save separation.

Public build isolation: `npm run check` ends with `scripts/verify-public-build.mjs dist`, which fails if the bundle contains the Developer Panel, sandbox, morph gallery or `__tidepool` console API. `npm run build:artifact` runs it on the single-file build too.

## Developer panel

Available only in developer builds (`npm run dev`, `npm run sandbox`). Press backtick (or F9) in game. It never appears in normal play, and any use sets `flags.devUsed` in the save.

Money (add, zero), time (hour, day, week, skip to opening), tank (target selector, instant cycle, ammonia spike, nitrate, pH, temperature, filth, algae bloom, filter and heater failure, clean all), fish (spawn any species, age, set health, feed or starve, inspect genetics), customers (spawn by goal, spawn many, patience), progression (reputation, complete goals, build the next expansion with requirements met, hire one of each role, stock the retail racks). Visual genetics: choose sex and stage (fry, juvenile, adult, gravid) and spawn; spawn a morph sampler (every morph and trait, both sexes); spawn 10 adult siblings from a pair; age fry +10 days; randomise genes; pick a trait locus and allele and apply it to the chosen species in the tank; open the morph gallery. Breeding: force pregnancy or spawn (due in one hour), create 6 fry, make tank fish breeding-ready, trigger a mutation. Uses the chosen species when a pair is present.

### Tank view performance (v0.3.0, historical)

Measured CPU time of `TankRenderer.update` (headless Chromium, software GL, 120L tank with floating plants): 8 fish 2.5 ms, 28 fish 2.3 ms, 78 fish 2.6 ms per frame (max 4 to 8 ms). Painting a fish sheet costs 8 to 40 ms and is budgeted at 10 ms per frame. GPU fill rate is the limit in software GL only.

Long-run after the visual pass: 30 days £1,123; 100 days £2,315; 365 days £6,720, 192 bred, save 212 KB.

## Manual verification checklist (vertical slice)

Run through this after any change touching gameplay flow:

1. Title shows a live aquarium; New Game accepts names; the intro letter appears.
2. Walk around with keyboard; collision with tanks, counter, shelves and walls works.
3. Face a tank: prompt shows; Z opens the tank menu; F feeds.
4. View Tank: fish swim, school, sift; E cycles the selection; F drops food that fish chase and eat; X returns to the shop.
5. Water Test shows readings with plain-language notes; Maintenance actions change values and cost time.
6. Aquascape: place, move and remove decor; score updates; substrate change reloads the view.
7. Customers enter, browse, show thought bubbles, queue at the till; "?" customers come to you for advice.
8. Serve at the till from behind the counter: ring up, discount, add-on, haggling.
9. Office PC: order livestock (arrives next opening), stockroom purchases, accounts, reputation, goals.
10. End the day: daily report, autosave, deliveries.
11. Office PC: Save game shows "Game saved." and the HUD indicator; reload the page, Continue restores the game. Load, Export and Import work from the PC.
13. Tank menu > Breeding explains conditions; Livestock > fish shows family and traits (Q / E scroll); Name a strain is offered only for F2+ shop-bred lines.
14. Aquascape: substrate/background previews restore on Cancel; plants show growth stages; cuttings appear in the stockroom.
16. Tank view: fish of the same species look different (sex, size, traits); gravid females are fuller; fry are small, pale and translucent; fish turn through yaw frames; corys sift with puffs; plecos cling to the back glass; Z on a selected fish opens its details with a portrait.
17. Floating plants: buy a portion of duckweed from Aquascape (preview shows on the surface), watch it spread over days, scoop half to the stockroom, float it in another tank, sell the rest.
15. Order livestock to two tanks in one order; warnings show for an uncycled or full tank and the order can still be placed.
12. Production build (`npm run build && npx vite preview`) behaves the same.

## Definition of done

A feature is done when it works in the playable game, not when the code exists:

- `npm run check` passes.
- The relevant manual checklist steps were exercised (screenshots for visual changes).
- Docs updated (`TASKS.md` status, `DECISIONS.md` for choices, schema docs if data changed).
- The main branch is left playable.

## Manual checks for v0.4.0

- Tank menu: overview at the top (overall status, five scores, top issues); an issue opens with numbers, affected fish, consequences and actions with predicted effects; "Help: ..." rows open the glossary.
- Overworld bubble matches the top issue (make a fish sick in clean water: pink +, not red !).
- H, F1, gamepad LT and the ? button open Help; H again closes it.
- Idle Mode from the pause menu: badge "IDLE MODE · BUSINESS PAUSED", clock frozen, every buy/sell/feed/maintain/order/price row shows "Idle Mode" and the reason, tank view UI fades after 6 s (any key or mouse movement brings it back), Hide UI works, Resume Business restores everything.
- Build each expansion via the dev panel; take the stairs; customers and staff appear on the floors they are on; marine tank shows salinity as SG in the water test and the diagnostics.
- Hire staff; a stock clerk walks up with a suggestion: Approve / Review / Not now.
- Copy Playtest Report copies text (or shows it to copy by hand).
