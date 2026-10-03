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

Open the production build with `?dev=1` (or `#dev`) to enable the developer panel. `npm run build:artifact` makes the hosted single-file version.

## For AI agents and contributors

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

## Controls

Move: arrow keys or WASD (gamepad d-pad or stick). Interact: Z, Enter or Space (A). Back: X or Backspace (B). Menu: Esc (Start). Facing a tank, F feeds it. T cycles game speed. Mouse works in menus and for selecting fish.
Q / E scroll long details (and cycle fish in the tank view).

Saving: walk to the office PC (top right) to save, load, export or import. The game also autosaves every morning at opening.
