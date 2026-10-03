# Tasks

Agents: pick the highest item in **Next up** that is not blocked, mark it IN PROGRESS with your session date, and move it to **Done** with a one-line note when it meets the definition of done in `TESTING.md`. Add discovered work to **Backlog** in priority order.

## Next up (priority order)

1. **Public playtest of v0.4.0.** Deploy to GitHub Pages, collect Copy Playtest Report texts. Watch for: diagnostics wording, whether players find Help (H / ?), staff wage balance at level 2, Idle Mode clarity, whether the progression requirements feel reachable. Acceptance: findings in TESTING.md, tuned numbers in DECISIONS.md.
2. **Human playtest and balance pass (v0.2.0 carry-over).** Watch a first-time player for 3 in-game days and a returning player for 2 weeks. Check day 1 to 3 feel busy but fair, breeding is discovered without help, mid-game money growth feels rewarding (long-run bot only earns £10 to £15/day). Acceptance: documented findings in TESTING.md and tuned numbers in DECISIONS.md.
2. **Visual polish follow-ups.** Egg sprites on glass and plants for egg layers; disease visuals once disease exists; leaf litter and blackwater tannin as an aquascape option; hand-tuned per-species profile tweaks in the gallery (pleco head width, cory dorsal spine); the bot should scoop duckweed in long runs.
3. **Species wave 1 (Milestone 2).** Cherry Shrimp (colony breeding, colour grades), Otocinclus (algae grazer), Kuhli Loach (nocturnal, sand), Betta (solitary males, bubble nest method). Each with breeding data, genetics where relevant, art check in tank view, supplier entry. Acceptance: species tests pass, each visible and breeding in game.
4. **Disease v1.** Ich and fin rot from sustained stress or bad water; spread within a tank; visible symptoms; treatments sold as dry goods; quarantine advice. Acceptance: unit tests for onset and treatment; visible in tank view.
5. **Breeding tools.** Breeder box (protects livebearer fry), fry food (faster growth), pairing preview (expected looks from two parents using known genes).
6. **Events v1.** Heatwave, power cut, rare shipment offer, each a choice. Fire via dev panel and naturally at low rates.
7. **Plant depth.** Light level per tank, fertiliser dry good, runners and rhizome splits as propagation methods, three more plant species.
8. **Staff depth.** Dialogue pools per personality, training at the PC, morale and breaks, receiving deliveries as a Stock task, a staff room on a floor.
9. **Marine depth.** Alkalinity and calcium, corals with light needs, cleaner shrimp, quarantine and acclimation for marine deliveries.
10. **Accessibility pass.** Text size option, high-contrast UI, reduced motion in the tank view, key rebinding.

## Backlog

- Review the three high-severity npm audit findings in the build-only `vite-plugin-singlefile -> micromatch -> braces` chain (2026-10-03). Validate a compatible remedy in a separate PR; the suggested force fix downgrades the plugin to 0.9.0.

- Customer special orders (reserve fish for collection on a later day)
- Aquarium club visits and loyalty rewards
- Optional "Live Simulation" variant of Idle Mode (time runs, transactions stay locked); hook described in DECISIONS.md
- Overworld icon for a staff member waiting with a suggestion (currently a speech bubble)
- Customers collide with staff only visually (no actor collision)
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

- 2026-10-03: Pages timeout blocker fixed with a per-test 30-second limit; all 120 tests and the full Node 22 Pages-path check/build pass. Added pull-request checks and MAINTAINING.md; deployment remains pending merge and successful Pages jobs.

- 2026-10-03: v0.4.0. Tank diagnostics and previews, habitat numbers, help and glossary, staff (hiring, roles, proposals), Idle Mode, floor registry with stairs and save v3, three expansions with eight new species, marine v1, equipment retail, Shop Progression, GitHub Pages workflow, playtest report. Tests: diagnostics, idle, floors, staff, marine and retail, long runs with staff and every floor

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
- 2026-10-03: Habitat visual pass (v0.3.0): phenotype system and fish painter, visible trait loci, turn frames, organic motion, portraits, morph gallery and dev tools, plant architectures and growth stages, new plants, floating plants (sim and render), hardscape/substrate/background painters, light map, water look, quality settings
