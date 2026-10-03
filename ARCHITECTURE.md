# Architecture

## Layers

```
data/      Pure content definitions (species, decor, equipment, layouts, customer archetypes)
sim/       Pure simulation over plain GameState. No Phaser, no DOM. Fully unit-testable.
render/    Phaser scenes and renderers. Read GameState; never own gameplay state.
ui/        HTML/CSS screens over the canvas (menus, dialogue, HUD).
input/     Keyboard + gamepad mapped to abstract actions.
game/      GameController: glue between scenes, UI, input, simulation and saves.
```

Dependency direction: `data <- sim <- (render, ui) <- game`. `sim` must never import from `render`, `ui` or `game`. `render` and `ui` may import `sim` functions to read and mutate state through sim APIs (actions live in sim, e.g. `feedTank`, `completeSale`).

## Key rules

- **GameState is the single source of truth.** It is plain JSON (`src/sim/types.ts`) and is saved verbatim. Systems are stateless functions or small classes operating on it.
- **One fish, one entity.** The tank view's `FishAgent` holds only visual state (position, velocity, animation) and points at the persistent `FishEntity`. No fake fish.
- **Two simulation levels.** Background simulation (`tickTank`, 5-minute steps) updates hunger, health, growth, water for every tank. Detailed behaviour (`FishBehaviour`) runs only for the tank being viewed. While a tank is viewed, `tank.viewActive` is set and fish eat food pellets on contact instead of the background feeding pass. Food quantity stays in `tank.food` either way, so the two levels agree.
- **Data-driven content.** Gameplay reads species fields and tags, never species IDs. Adding a species must not require code changes. The same holds for decor and equipment.
- **Determinism.** Simulation randomness uses the seeded `Rng` whose state is saved (`rngState`). Purely cosmetic randomness uses `visualRng`.
- **No giant managers.** Each system is a module with a narrow API.

## Module map

| Module | Responsibility |
| --- | --- |
| `sim/simulation.ts` | `Simulation`: advances time, steps customers continuously and tanks in fixed steps, handles hour/day boundaries (open, close, midnight costs, deliveries, reports), emits events |
| `sim/time.ts` | TimeSystem: calendar, opening hours, ambient temperature |
| `sim/water.ts` | WaterSystem: nitrogen cycle, temperature, pH, oxygen, algae, filter wear, water changes |
| `sim/fish.ts` | FishSystem: creation, hunger, eating, growth, health, death, value |
| `sim/compat.ts` | Compatibility, stocking capacity, stress targets, suitability checks for advice |
| `sim/aquascape.ts` | AquascapeSystem: cover, caves, provided habitat tags, layout and beauty scores |
| `sim/tank.ts` | TankSimulation tick plus all player tank actions (feed, maintenance, equipment, decor) |
| `sim/customers.ts` | CustomerSystem and CustomerAI: spawning, pathing, browsing, reservations, queueing, advice, problems, sales, haggling |
| `sim/pathfinding.ts` | Grid BFS |
| `sim/economy.ts` | ShopEconomy: spend/earn, ledger, running costs, player prices |
| `sim/reputation.ts` | ReputationSystem: dimensions, nudges, daily drift |
| `sim/supplier.ts` | SupplierSystem: stock rotation, orders, deliveries, dry goods |
| `sim/progression.ts` | ProgressionSystem: objectives (future: unlocks) |
| `sim/plants.ts` | PlantSystem: growth by light/nutrients/size, cuttings, trimming, stockroom (potted plants, stored decor), plant value and trade sales |
| `sim/breeding.ts` | BreedingSystem: per-method conditions report, pregnancies, egg broods, hatching survival, fry predation vs cover, population caps |
| `sim/genetics.ts` | GeneticsSystem: genotype expression, morph from genes, inheritance, mutation, trait view, strains (eligibility, founding, inheritance) |
| `sim/trade.ts` | Trade buyer: wholesale prices for surplus fish (fry discounted, demand aware) |
| `sim/orderCheck.ts` | Order validation: per line and per tank warnings (cycled, capacity, temperature, pH, hardness, water type, compatibility, group size). Advice only, never blocks |
| `sim/save.ts` | SaveSystem: versioned serialise/deserialise, migrations, IndexedDB/localStorage/memory storage |
| `sim/newGame.ts` | Starter shop factory and `SAVE_VERSION` |
| `data/genetics.ts` | Per-species loci (alleles with dominance ranks) and ordered morph rules |
| `render/res.ts` | `RES` (2), logical 480x320 and canvas 960x640 sizes |
| `render/scenes/BootScene.ts` | Generates procedural textures |
| `render/scenes/TitleScene.ts` | Demo aquarium behind the title menu |
| `render/scenes/ShopScene.ts` | Overworld: tiles, props, player grid movement, customers, interaction routing |
| `render/scenes/TankScene.ts` | Inspection view host |
| `render/tankRenderer.ts` | Draws a tank in detail; owns `FishAgent`s, pellets, bubbles, overlays |
| `render/fishBehaviour.ts` | Steering behaviours (cruise, school, feed, hide, rest, sift, graze, gulp, chase, court, dead) |
| `render/overworldTank.ts` | Tiny animated tank in the shop view with status icons |
| `render/art/*` | Procedural pixel art: shop tiles and props, characters, fish, decor |
| `ui/ui.ts` | `UIManager` screen stack, `MenuScreen`, `DialogueScreen` (`say`, `ask`, `confirm`), `PromptScreen` (`prompt`) |
| `ui/menu.ts` | Keyboard/gamepad/mouse menu component |
| `ui/hud.ts` | HUD (date, clock, money, stars, goal, interaction prompt) |
| `ui/screens/*` | Title, pause (settings, save slots, export/import), tank menu (livestock, fish detail, breeding, plants, prices), office PC (save hub, orders, stockroom, stats), till/advice flows, tank view overlay, aquascape editor with previews, day report, help, dev panel |
| `audio/sfx.ts` | Synthesised WebAudio sound effects, per-browser mute |
| `ui/touch.ts` | On-screen controls for coarse pointers |
| `game/GameController.ts` | Game loop timing, input routing, pause rules, saves, scene transitions |

## Game loop

Phaser's `STEP` event drives `GameController.step`:

1. Poll gamepads.
2. Update the top UI screen (typewriter text etc.).
3. If in game and not paused, `sim.advance(dt * 2 minutes * speed)`.
4. Update the HUD.
5. Show queued day reports once no blocking screen is open.

Scenes render in their own `update` by reading `controller.state`.

`Simulation.advance` steps at most 1 game minute at a time and never across an hour boundary, so open/close/midnight events fire exactly. Tanks tick every 5 game minutes. Dev fast-forward uses the same path.

## Input routing

`InputManager` turns keys and gamepad buttons into `Action`s. On each press the controller offers it to the top UI screen; if no screen consumes it, it goes to `controller.worldInput` (set by the active scene). Movement uses held state, polled by `ShopScene`. Text inputs swallow keys except Enter and Escape.

## Resolution

The canvas is 960x640 (`RES = 2` in `render/res.ts`). The shop overworld is authored at 480x320 logical pixels and drawn with camera zoom 2, so tiles stay crisp pixel art. The tank view renders natively at 960x640 (fish, plants and effects use the extra resolution). UI is HTML and sized in logical pixels.

## UI

HTML screens sit in `#ui`, sized exactly over the canvas. `--px` is the CSS pixels per logical game pixel, so all UI dimensions are written as `calc(var(--px) * n)` and stay aligned with the 480x320 logical game at any window size. Blocking screens pause time. World labels (customer bubbles) are positioned in logical pixel coordinates with `setLabelPos`. Fonts are bundled (`@fontsource/jersey-10` body, `@fontsource/tiny5` logo); there are no runtime network requests.

### Menu and input rules (one system for every menu)

- `InputManager` is created once. Keys map to actions; non-direction keys never auto-repeat; held arrows repeat no faster than `KEY_REPEAT_MIN_MS` (70 ms). Text inputs swallow everything except Enter and Escape.
- `UIManager` is a strict stack. Only the top screen receives actions; screens underneath never react. Closing a screen returns input to the one below with its selection unchanged.
- `Menu` is the only list component. Headers are never selectable. Disabled rows can be highlighted (so their hint explains why) but never run. Refreshing keeps the selected index (clamped). Exactly one row has `.selected`.
- Mouse selection only follows real pointer movement (coordinates compared), so rows re-rendering or scrolling under a resting cursor cannot steal the selection. The list scrolls itself (no `scrollIntoView`), and the hint line has a fixed height so rows never shift when hints change.
- Panel bodies have a capped height and scroll; Q / E (gamepad bumpers) scroll long details such as the fish card.
- Phaser scene event emitters survive stop/start, so scenes add listeners with `once(SHUTDOWN)` and remove WAKE/SLEEP listeners on shutdown.
- Tests: `tests/menu.test.ts` (happy-dom) covers selection, headers, disabled rows, refresh, resting mouse, nested stacks, dialogue choices, key repeat and typing.

## Recipes

**Add a species:** add an entry to `src/data/species.ts` following `SPECIES_SCHEMA.md`. Set `starter: true` to sell it at Riverside, or add it to a supplier's `species`. The renderer draws it from `body` and morph colours. Run `npm test` (the species consistency test checks ranges).

**Add decor:** add to `DECOR` in `src/data/catalog.ts` with an `art` key. For a new art key, add a case in `render/art/decorArt.ts` (`ensureHardscapeTexture` or `buildPlant`).

**Add a UI screen:** prefer `c.ui.menu({ title, items, body })`. For custom input, implement `Screen` (`el`, `blocking`, `handle`). Long flows can be written as async functions with `await c.ui.say(...)` and `await c.ui.ask(...)`.

**Add a player action:** implement it in `sim/` returning `ActionResult { ok, message, minutes }`, then call it through `controller.perform(result)` so time advances and feedback is shown.

**Change GameState:** follow `SAVE_SCHEMA.md` (bump `SAVE_VERSION`, add a migration, add a test).

**Add a floor:** add a `FloorLayout` in `data/shopLayout.ts`. `Simulation.layout` and `ShopScene` currently assume `FLOOR1`; generalising this is a Milestone 3 task.

## Build targets

- `npm run build`: static multi-file site in `dist/` with PWA manifest and service worker (`public/sw.js`). The `tidepool-sw-version` Vite plugin stamps the worker with a unique build id and the list of built files: every deploy installs into a fresh `tidepool-<id>` cache, precaches the game for offline play and deletes old caches on activate. Pages and unhashed files are network first; hashed `assets/` are cache first. Saves live in IndexedDB and are never touched by updates.
- `npm run build:artifact`: single-file build reshaped for the hosted claude.ai artifact (`dist-artifact/`).
- `npm run build:single`: one self-contained HTML (`dist-single/index.html`) for hosts that want a single file. Service worker registration is skipped in this mode.
- Desktop/Steam/mobile packaging later can wrap `dist/` (Electron, Tauri or Capacitor) without code changes; keep the game free of server dependencies.
