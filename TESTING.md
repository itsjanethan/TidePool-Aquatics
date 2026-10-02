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

Simulation code is pure, so prefer adding tests at the `sim/` level. If you change balance numbers, run `npx vitest run tests/balance.test.ts --silent=false` and read the printed summary.

## Browser checks

`scripts/shot.mjs` drives the real game in headless Chromium and takes screenshots:

```bash
npx vite --port 5173 &
node scripts/shot.mjs http://localhost:5173/ out.png '[{"key":"Enter","wait":400},{"type":"Tester"},{"key":"Enter"},{"key":"Enter","wait":1200}]'
```

Steps support `key` (press), `type` (text), `eval` (JS in page; result printed), `wait` (ms) and `shot` (screenshot path). In dev builds or with `?dev=1`, `window.__tidepool` exposes the GameController for scripted checks (for example teleporting the player or reading state).

`scripts/reload-test.mjs` verifies that a save survives a page reload in a persistent browser profile.

Chromium lives at `/opt/pw-browsers/chromium-1194/chrome-linux/chrome` in the agent sandbox; adjust `exe` elsewhere.

## Developer panel

Available in `npm run dev` builds, or in production with `?dev=1` in the URL. Press backtick (or F9) in game. It never appears in normal play, and any use sets `flags.devUsed` in the save.

Money (add, zero), time (hour, day, week, skip to opening), tank (target selector, instant cycle, ammonia spike, nitrate, pH, temperature, filth, algae bloom, filter and heater failure, clean all), fish (spawn any species, age, set health, feed or starve, inspect genetics), customers (spawn by goal, spawn many, patience), progression (reputation, complete goals, unlock flags). Breeding controls are listed but disabled until Milestone 2.

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
11. Save to a slot, reload the page, Continue restores the game.
12. Production build (`npm run build && npx vite preview`) behaves the same.

## Definition of done

A feature is done when it works in the playable game, not when the code exists:

- `npm run check` passes.
- The relevant manual checklist steps were exercised (screenshots for visual changes).
- Docs updated (`TASKS.md` status, `DECISIONS.md` for choices, schema docs if data changed).
- The main branch is left playable.
