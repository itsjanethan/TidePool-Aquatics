# Tasks

Agents: pick the highest item in **Next up** that is not blocked, mark it IN PROGRESS with your session date, and move it to **Done** with a one-line note when it meets the definition of done in `TESTING.md`. Add discovered work to **Backlog** in priority order.

## Next up (priority order)

1. **Playtest balance pass.** Watch a first-time player for 3 in-game days. Tune customer arrival (`customers.ts` perHour), prices, hunger rate, algae growth and daily costs so day 1 to 3 feel busy but fair. Acceptance: a new player ends day 3 with more money than they started and at least one completed sale per day without using the dev panel.
2. **Breeding: livebearers (Milestone 2).** Mature, healthy male+female of a `livebearer` species in the same tank produce pregnancies (`FishEntity.pregnancy`), birth fry with `parents`, `generation`, `origin: 'bred'`. Fry survival depends on cover (`fry_cover` tag, plant cover) and predation by adults. Fry visible in tank view at small size. Acceptance: unit tests for pregnancy/birth/survival; fry visible in the guppy tank after a few in-game weeks; dev panel "Force pregnancy" and "Create fry" enabled.
3. **Genetics v1.** Per-species loci in species data (e.g. guppy tail colour, albino recessive), inheritance on birth, morph derived from genotype, quality inherited with noise. Acceptance: punnett-ratio unit test; dev panel "Inspect genetics" shows loci.
4. **Lineage and strain naming.** Fish card shows parents and generation; player can name a strain on a bred fish and descendants inherit it with `F<n>`. Acceptance: name a strain, breed two generations, see "My Strain F2".
5. **Disease v1.** Ich and fin rot triggered by sustained stress or bad water; spread within a tank; visible symptoms (white specks, ragged fins); treatments sold as dry goods. Acceptance: tests for onset and treatment; visible in tank view.
6. **Events v1.** Event system with 3 events presenting choices: heatwave (cool tanks or risk), power cut (air pumps/battery), rare shipment offer. Acceptance: each fires via dev panel and naturally at low rates.
7. **10 more species** toward 20 to 30 (see ROADMAP). Each with morphs and behaviour tuning verified in the tank view.
8. **Generalise floors.** `Simulation.layout`, `ShopScene` and customer pathing read the player's current floor; add stairs prop. Prerequisite for Floor 2.
9. **Audio pass.** Ambient filter hum and bubbles in the tank view, shop ambience, simple music loop with mute and volume settings.
10. **Accessibility pass.** Text size option, high-contrast UI option, reduced-motion respect for fish view effects, key rebinding.

## Backlog

- Customer special orders (reserve fish for collection on a later day)
- Aquarium club visits and loyalty rewards
- Staff (Milestone 3): hiring screen, wages, skills, task assignment, dialogue pools
- Shop upgrades and decoration placement in the overworld
- Tank purchases and replacement with larger tanks
- Seasonal demand curves and weekday patterns
- Plant growth and trimming; CO2 for high-tech planted tanks
- Quarantine tank workflow for new deliveries
- Achievements
- Desktop packaging (Tauri) and itch.io page
- Localisation framework (all UI strings currently inline)

## Known issues

- Fonts load from Google Fonts; offline first load falls back to monospace until cached.
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
