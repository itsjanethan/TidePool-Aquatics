# Tasks

Agents: pick the highest item in **Next up** that is not blocked, mark it IN PROGRESS with your session date, and move it to **Done** with a one-line note when it meets the definition of done in `TESTING.md`. Add discovered work to **Backlog** in priority order.

## Next up (priority order)

1. **Human playtest and balance pass (v0.2.0).** Watch a first-time player for 3 in-game days and a returning player for 2 weeks. Check day 1 to 3 feel busy but fair, breeding is discovered without help, mid-game money growth feels rewarding (long-run bot only earns £10 to £15/day). Acceptance: documented findings in TESTING.md and tuned numbers in DECISIONS.md.
2. **Species wave 1 (Milestone 2).** Cherry Shrimp (colony breeding, colour grades), Otocinclus (algae grazer), Kuhli Loach (nocturnal, sand), Betta (solitary males, bubble nest method). Each with breeding data, genetics where relevant, art check in tank view, supplier entry. Acceptance: species tests pass, each visible and breeding in game.
3. **Disease v1.** Ich and fin rot from sustained stress or bad water; spread within a tank; visible symptoms; treatments sold as dry goods; quarantine advice. Acceptance: unit tests for onset and treatment; visible in tank view.
4. **Breeding tools.** Breeder box (protects livebearer fry), fry food (faster growth), pairing preview (expected looks from two parents using known genes).
5. **Events v1.** Heatwave, power cut, rare shipment offer, each a choice. Fire via dev panel and naturally at low rates.
6. **Plant depth.** Light level per tank, fertiliser dry good, runners and rhizome splits as propagation methods, three more plant species.
7. **Generalise floors** (prerequisite for Milestone 3).
8. **Accessibility pass.** Text size option, high-contrast UI, reduced motion in the tank view, key rebinding.

## Backlog

- Customer special orders (reserve fish for collection on a later day)
- Aquarium club visits and loyalty rewards
- Staff (Milestone 3): hiring screen, wages, skills, task assignment, dialogue pools
- Shop upgrades and decoration placement in the overworld
- Tank purchases and replacement with larger tanks
- Seasonal demand curves and weekday patterns
- CO2 for high-tech planted tanks
- Quarantine tank workflow for new deliveries
- Achievements
- Desktop packaging (Tauri) and itch.io page
- Localisation framework (all UI strings currently inline)

## Known issues

- Customers can overlap each other and the player (no actor collision by design for now).
- The single-file build cannot register the service worker (by design); use the static `dist/` build for offline play.

## Done

- 2026-10-02: Project scaffold (TS + Phaser 3.90 + Vite 8), lint, tests, builds, PWA files
- 2026-10-02: Living docs created (GAME_DESIGN, ARCHITECTURE, ROADMAP, TASKS, DECISIONS, SPECIES_SCHEMA, SAVE_SCHEMA, ART_DIRECTION, TESTING)
- 2026-10-02: Simulation core: fish entities, nitrogen cycle, temperature, pH, hardness, oxygen, algae, stress, growth, death
- 2026-10-02: Ten starter species with data-driven art and behaviour
- 2026-10-02: Shop overworld: tiles, props, grid movement, collision, animated mini tanks with status icons, night lighting
- 2026-10-02: Aquarium inspection view: persistent fish agents, schooling, sifting, grazing, hiding, chasing, courting, air gulping, feeding with pellets, overlays for algae/dirt/cloudiness
- 2026-10-02: Tank menu: feed, livestock (inspect, move), water test, maintenance, equipment, prices, aquascape editor
- 2026-10-02: Customers: archetypes, browsing, reactions, reservations, queue, advice and problem conversations, haggling, add-ons, loyalty profiles, complaints after bad advice
- 2026-10-02: Office PC: two suppliers with rotating stock and delivery, stockroom, accounts, reputation, goals, end day
- 2026-10-02: Multi-dimension reputation, daily report, autosave, save slots, export/import
- 2026-10-02: Developer panel (money, time, tank, fish, customers, progression)
- 2026-10-02: Starter objectives as onboarding, intro letter, help screen
- 2026-10-02: Synthesized sound effects with mute; touch controls on coarse-pointer devices (or `?touch`)
- 2026-10-02: Balance bot test (21 days) passing
- 2026-10-03: Menu/input system fixed systemically (pointer movement check, fixed hint line, list-only scrolling, capped key repeat, scene listener leaks); tests in tests/menu.test.ts
- 2026-10-03: Mirrored "2"/"5" fixed by replacing the font with bundled Jersey 10 / Tiny5
- 2026-10-03: Aquascape previews with Confirm/Cancel, ownership and stockroom ("Owned", "×n")
- 2026-10-03: Plant growth, stages, cuttings, trimming, replanting, plant sales (till, shelf, trade)
- 2026-10-03: HD tank view (2x canvas, 8-frame fish, depth, caustics, rays, shadows, surface)
- 2026-10-03: Multi-tank orders with validation warnings
- 2026-10-03: Office PC save hub (save, load, export, import, settings, stats), autosave indicator
- 2026-10-03: Breeding (4 methods), persistent fry, predation and cover, genetics with carriers and mutations, lineage, strains, breeding screen, dev breeding tools
- 2026-10-03: Demand saturation, trade buyer, "Customers can buy" toggle
- 2026-10-03: Long-run tests 30/100/365 days with invariants; profile cap (save 1 MB to 186 KB)
- 2026-10-03: Versioned service worker with precache; offline verified
