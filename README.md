# Tidepool Aquatics

A browser-first aquarium shop management game. Start with a tiny local fish shop and grow it into a specialist aquarium centre full of rare livestock, beautiful display tanks, skilled staff and loyal customers.

Built with TypeScript, Phaser 3 and Vite. Deploys as a static site.

## Quick start

```bash
npm install
npm run dev          # http://localhost:5173 (dev panel: press ` in game)
npm run check        # typecheck + lint + unit tests + production build
npm run build        # static site in dist/
npm run build:single # one self-contained HTML file in dist-single/
```

`npm run build:artifact` makes the hosted single-file version.

### Developer tools and the Developer Sandbox (local only)

```bash
npm run dev          # developer build: press ` (or F9) in game for the Developer Panel
npm run sandbox      # opens straight into the Developer Sandbox (http://localhost:5173/?sandbox)
npm run build:sandbox  # optional local build in dist-sandbox/ (never deployed, git-ignored)
```

The Developer Sandbox is a fixed-seed game with every implemented floor, expansion, species, plant, ornament, equipment and retail item available, healthy mature freshwater and marine tanks, four staff, £100,000 and full stock. Its tools screen (Developer Panel > Sandbox tools) jumps between floors and tanks, applies presets (planted, breeding, coldwater, marine, mixed reef, shrimp, dart frog vivarium, desert terrarium, paludarium, performance test at the population cap), advances time and resets. Sandbox saves live in their own namespace and never appear under Continue; importing one into normal play warns first and marks it developer-used.

Developer tools exist only in development and sandbox modes. The public production build (`npm run build`, GitHub Pages, the single-file build) compiles them out: no URL flag, storage flag or console API can turn them on, and `npm run check` fails if `scripts/verify-public-build.mjs` finds developer code in `dist/`. The source is public, so this keeps the hosted game free of developer tools; it does not make the sandbox secret. Do not publish `dist-sandbox/`; if remote developer access is ever needed, host it behind real authentication enforced by the server.

Current version: **0.4.0** (shown on the title screen, the pause menu and Help).

## Deploying / Public Playtest

The game is a static site. GitHub Pages is the supported host:

1. Push the repository to GitHub.
2. In the repository, open **Settings > Pages** and set **Source** to **GitHub Actions** (one time).
3. Push to `main`, or run **Actions > Deploy to GitHub Pages > Run workflow**. The workflow (`.github/workflows/deploy-pages.yml`) runs `npm ci`, `npm run check` (types, lint, tests, build) and publishes `dist/`.
4. The game appears at `https://<user>.github.io/<repo>/` (or the root for a `<user>.github.io` repository).

Base path: builds are relative (`./`) by default, so `dist/` also works from any folder, a zip or a sub-path on another host. The workflow sets `BASE_PATH=/<repo>/`; set `BASE_PATH` yourself for other absolute hosts (`BASE_PATH=/games/tidepool/ npm run build`). `node scripts/nested-test.mjs <url>` checks a deployed or locally served copy boots from a nested path, registers its service worker and loads every file.

Saves live in each player's browser (IndexedDB) and survive new deploys. Players can move saves between browsers with Export / Import at the office PC.

**Playtest feedback:** in the pause menu, **Copy Playtest Report** copies a short text (version, save version, day and time, floor, money, reputation, current goal, recent warnings, Idle Mode, browser) plus an optional description, ready to paste into an issue or message. The game collects and sends nothing.

## For AI agents and contributors

See [MAINTAINING.md](MAINTAINING.md) for the product-owner/maintainer roles, pull-request checks and release process. Use Node 22 and `npm ci` for reproducible validation.

This repository is developed mostly by AI coding agents. Before any task:

1. Read `TASKS.md` and `ROADMAP.md` to find the highest-priority incomplete work.
2. Read `ARCHITECTURE.md` for module boundaries and `DECISIONS.md` for settled choices.
3. Check the relevant schema docs (`SPECIES_SCHEMA.md`, `SAVE_SCHEMA.md`) before changing data.
4. Follow the development cycle and definition of done in `TESTING.md`.
5. Record new minor decisions in `DECISIONS.md` and keep `TASKS.md` current.

| Document | Purpose |
| --- | --- |
| `GAME_DESIGN.md` | What the game is and how each system should feel |
| `ARCHITECTURE.md` | Code layout, layers, data flow, extension recipes |
| `ROADMAP.md` | Milestones and their status |
| `TASKS.md` | Prioritised task list with acceptance criteria |
| `DECISIONS.md` | Log of design and technical decisions |
| `SPECIES_SCHEMA.md` | Species data fields |
| `SAVE_SCHEMA.md` | Save format, versioning and migrations |
| `ART_DIRECTION.md` | Visual rules and procedural art approach |
| `TESTING.md` | Test commands, dev panel, verification checklist |
| `STAFF.md` | Staff personalities, skills, roles and suggestions |

## Controls

Move: arrow keys or WASD (gamepad d-pad or stick). Interact: Z, Enter or Space (A). Back: X or Backspace (B). Menu: Esc (Start). Help: H or F1 (gamepad LT or right-stick click), or the ? button. Facing a tank, F feeds it. T cycles game speed. Mouse works in menus and for selecting fish.
Q / E scroll long details (and cycle fish in the tank view). Stairs on the left wall lead to other floors once they are built.
Run: hold B in the store (X or Shift on a keyboard, B or X on a gamepad). Map: M (gamepad left-stick click) or the Map button switches between following the player and the whole floor.

Phones and tablets: on-screen d-pad and A / B / F / menu buttons sit below the game in portrait and either side in landscape; their labels follow what they do (B shows Run while walking, Back in menus). Hold a direction and B together to run. Tap the floor to walk there, tap what you face to use it. Settings (title screen, pause menu, office PC) has text size, a readable font, the store camera and tap to move; these are remembered on the device.

Saving: walk to the office PC (top right) to save, load, export or import. The game also autosaves every morning at opening.

Idle Mode (pause menu or office PC) pauses the business while fish keep swimming: nothing can be bought or sold, and loading a save always resumes normal play.
