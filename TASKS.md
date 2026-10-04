# Tasks

Agents: pick the highest item in **Next up** that is not blocked, mark it IN PROGRESS with your session date, and move it to **Done** with a one-line note when it meets the definition of done in `TESTING.md`. Add discovered work to **Backlog** in priority order.

## Next up (priority order)

0. **Comparison follow-ups (COMPARISON.md, ranked).** Start with standing orders for consumables, the real-device pass, floor overlays and staff suggestions as an inbox. Acceptance per item in COMPARISON.md's table; tests for each sim change; screenshots for each UI change.
1. **Public playtest of v0.4.0.** Deploy to GitHub Pages, collect Copy Playtest Report texts. Watch for: diagnostics wording, whether players find Help (H / ?), staff wage balance at level 2, Idle Mode clarity, whether the progression requirements feel reachable. Acceptance: findings in TESTING.md, tuned numbers in DECISIONS.md.
2. **Human playtest and balance pass (v0.2.0 carry-over).** Watch a first-time player for 3 in-game days and a returning player for 2 weeks. Check day 1 to 3 feel busy but fair, breeding is discovered without help, mid-game money growth feels rewarding (long-run bot only earns £10 to £15/day). Acceptance: documented findings in TESTING.md and tuned numbers in DECISIONS.md.
2. **Visual polish follow-ups.** Egg sprites on glass and plants for egg layers; disease visuals once disease exists; leaf litter and blackwater tannin as an aquascape option; hand-tuned per-species profile tweaks in the gallery (pleco head width, cory dorsal spine); the bot should scoop duckweed in long runs.
3. **Species wave 1 (Milestone 2).** Cherry Shrimp (colony breeding, colour grades), Otocinclus (algae grazer), Kuhli Loach (nocturnal, sand), Betta (solitary males, bubble nest method). Each with breeding data, genetics where relevant, art check in tank view, supplier entry. Acceptance: species tests pass, each visible and breeding in game.
4. **Disease v1.** Ich and fin rot from sustained stress or bad water; spread within a tank; visible symptoms; treatments sold as dry goods; quarantine advice. Acceptance: unit tests for onset and treatment; visible in tank view.
5. **Breeding tools.** Breeder box (protects livebearer fry), fry food (faster growth), pairing preview (expected looks from two parents using known genes).
6. **Events v1.** Heatwave, power cut, rare shipment offer, each a choice. Fire via dev panel and naturally at low rates.
7. **Plant depth.** Light level per tank, fertiliser dry good, runners and rhizome splits as propagation methods, three more plant species.
8. **Staff depth.** Dialogue pools per personality, training at the PC, morale and breaks, receiving deliveries as a Stock task, a staff room on a floor.
9. **Marine depth.** Quarantine and acclimation for marine deliveries, specialist marine customers, marine staff expertise. (Corals, alkalinity and calcium, and invertebrates are the separate later expansion in the Backlog.)
10. **Accessibility pass.** High-contrast UI, key rebinding (text size and a readable font shipped with the mobile layout; reduced motion shipped with the aquarium visuals pass).

## Backlog

Later expansions, in this order (roadmap only; see ROADMAP.md, do not start before Milestones 2 to 4):

1. Corals and aquatic invertebrates: first pass DONE (feat/reef-floor). Remaining: crayfish, mussels, urchins and starfish, copper sensitivity, berried females and colour grades.
2. Vivariums, paludariums and related habitats: first pass DONE (feat/vivarium-floor). Remaining: riparium, newts and axolotls, shedding and moulting, temperature gradients beyond the basking spot, feeder cultures as living stock, herp staff skills.
3. Ant keeping as a dedicated expansion (formicaria, colony growth, brood, foraging, hibernation).

Follow-ups from 0.5:

- Check the mobile layout on real phones (iOS Safari and Android Chrome): browser bars, notches, on-screen keyboard, rotation, multi-touch d-pad plus B, performance of the tank view.
- Measure the tank view on real devices (phone and desktop GPU) and tune Auto quality's threshold (34 ms median) from those numbers.
- Pinch to zoom the store camera (map view covers it for now).

Other:

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

- 2026-10-04: Incoming livestock by destination tank: parcel tag in the shop, On order in the tank menu and tank view, outlook in ordering (now, on order, after delivery, stocking breakdown), destination picker with stocking after delivery, warnings that include placed orders, order cancellation, staff proposals aware of outstanding orders. Tests in `tests/incoming.test.ts`.
- 2026-10-04: Aquascape items explain what they give, which score components they change, the score now and after (and once grown), caps, fish care and trade-offs, all from the real scoring; on-screen placement buttons for touch. Tests in `tests/scapepreview.test.ts`.
- 2026-10-04: Rapid taps no longer zoom the page on mobile (touch-action plus touch guards on controls and the game area), no duplicate actions, rotation releases held buttons, menu opens during a tap-to-move walk. Tests in `tests/tapguard.test.ts`; emulated check `scripts/tap-zoom-check.mjs`. Real iPhone check still to do.
- 2026-10-03: Not for sale for individual fish: enforced in `sellable`, `completeSale` and `sellFishToTrade`; protecting releases reservations and updates the order; fish details toggle, badges in livestock lists and the fish card, bulk select with feedback; unprotect always confirms. Tests in `tests/protection.test.ts`.
- 2026-10-03: Aquarium visuals tied to tank state (pearling, mulm, surface film, hardscape shade and algae, light ramp, surface reflections on High), Auto quality (steps down only), reduced motion setting, staggered plant redraws, bounded per-tank texture caches. Profiling tools and before/after numbers in TESTING.md (headless, CPU-rasterised; no real-device numbers). Tests in `tests/visuals.test.ts`.
- 2026-10-03: Mobile layout: full-screen responsive game rectangle with safe areas, controls below (portrait) or beside (landscape), UI unit separate from canvas (16 px minimum text, 44 px targets, text size and readable font settings), menus as sheets, store camera following the player with map view, immersive tank view, tap to move, contextual A/B/F labels, store floor detail. Tests in `tests/layout.test.ts`; emulated checks in `scripts/mobile-check.mjs`. Not yet checked on a real phone.
- 2026-10-03: Hold B to run (2x, store only; on-screen B, gamepad B, keyboard X, Shift kept), contextual touch B label, "Hold B to run" hint, held input cleared on blur/hidden/pagehide, multi-touch d-pad with pointer capture. Tests in `tests/input.test.ts`.
- 2026-10-03: Developer Sandbox (local only) with presets, separate save namespace and build-time removal of all developer tools from the public build (verified in `npm run check`).

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
