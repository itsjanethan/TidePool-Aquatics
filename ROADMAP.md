# Roadmap

Status keys: DONE, IN PROGRESS, NEXT, LATER.

## Milestone 1: First public vertical slice (DONE, polishing)

Success test: another person can open the game in a browser, walk around the shop, inspect an aquarium, feed fish, serve at least one customer, make money, advance time and save. Met on 2026-10-02.

- DONE TypeScript + Phaser 3 + Vite project, lint, tests, single-file and static builds, PWA manifest and service worker
- DONE Living documentation set
- DONE One complete shop floor with ten tanks, collision, grid movement
- DONE Ten starter species with distinct behaviour and art
- DONE Persistent individual fish: growth, hunger, health, stress, value, death
- DONE Simplified water chemistry with nitrogen cycle, temperature, pH, hardness, oxygen, algae
- DONE Maintenance (water changes, glass, algae, vacuum, filter, dead fish, bacteria starter) costing time
- DONE Equipment (filters, heaters with thermostat, air stones)
- DONE Aquarium inspection view with detailed behaviour and food pellets
- DONE Basic aquascaping editor with gameplay effects
- DONE Visible customers who enter, browse, react, queue, ask for advice, haggle and buy
- DONE Money, suppliers, orders with delivery, dry goods, player pricing
- DONE Multi-dimension reputation
- DONE Game clock, days, seasons, opening hours, end of day report
- DONE Save/load (IndexedDB, slots, autosave, export/import)
- DONE Developer panel
- DONE Starter objectives as onboarding
- DONE Synthesised UI sounds with mute; touch controls for phones and tablets
- NEXT Balance pass with human playtesters

## Milestone 1.5: Stabilise, polish, plants, breeding (DONE 2026-10-03, v0.2.0)

Priority order followed: stabilise, player experience, deepen simulation, breeding and genetics, then content.

- DONE One menu/input system: no skipping, double moves, stolen selection or stale listeners; automated tests (`tests/menu.test.ts`)
- DONE Font replaced at the source (bundled Jersey 10; the old font drew "2" and "5" mirrored); glyphs audited
- DONE Aquascape live previews for substrate, background, decor and plants with Confirm/Cancel restoring exactly; ownership shown as "Owned" and "×n"
- DONE Plants as simulated organisms: size, health, growth from light/nutrients, stages (Cutting to Overgrown), cuttings at three sizes, trimming, stockroom, replanting, selling to customers and trade
- DONE HD tank view (2x canvas): 8-frame fish with eased turning and burst-and-coast swimming, depth layers, caustics, light rays, shadows, animated surface, growth-aware swaying plants
- DONE Multi-tank livestock orders (cart lines with own quantity and destination) with validation warnings that inform but never block
- DONE Office PC as the save hub: Save, Load, Export, Import, Settings, Statistics; "Game saved." confirmation; autosave stated everywhere; unobtrusive HUD save indicator
- DONE Breeding by method (livebearer, egg scatterer, adhesive eggs, cave spawner) with readiness, health, stress, water, layout and trigger conditions; breeding screen per tank explains what helps or blocks
- DONE Persistent fry (parents, inherited genes, growth, predation vs plant cover); "Customers can buy" toggle infers breeding/grow-out roles
- DONE Visible Mendelian genetics per species, mutations, carriers revealed for shop-bred fish and proven parents; lineage (mother, father, offspring, generation) on the fish card
- DONE Strain naming for established lines (F2+, both parents shop-bred and true to look); strains persist through generations and add capped value
- DONE Species demand saturation and a trade buyer for surplus fish and plants
- DONE Long-run simulation tests (30/100/365 days) with invariants; see TESTING.md for results
- DONE PWA: offline fonts, no external runtime requests, versioned service worker cache with precache and old-cache cleanup
- DONE Save v2 with migration from v1; optional-field normalisation

## Milestone 1.6: Habitat visual fidelity (DONE 2026-10-03, v0.3.0)

The aquarium view became a core product feature. See ART_DIRECTION.md.

- DONE Phenotype system: every fish painted from its own genes, sex, age, size, pregnancy, health and quality; siblings differ
- DONE Modular procedural fish painter: anatomy per body shape, 10 tail shapes, fin rays and translucency, 14 pattern layers, metallic glints, albino, golden, telescope eyes, wen, gravid spot, fry and juvenile states
- DONE Visible trait loci for all ten species (tails, dorsals, hi-fin, sailfin, lyretail, longfin, metallic, albino, tuxedo, wagtail, golden, veiltail, telescope)
- DONE Turn frames (yaw) instead of mirroring; organic motion (burst and glide, inertia, hovering, school points, sifting nose-down, glass grazing, feeding lunges); per-individual variation
- DONE Close-up portraits (tank view and fish card); developer morph gallery and visual genetics dev tools
- DONE Plant architectures with visible growth stages; Rotala, Cryptocoryne, Java Moss; propagation methods in data
- DONE Floating plants (duckweed, frogbit, red root floater) with coverage simulation, shade, nitrate uptake, fry cover, scoop, move and sell
- DONE Hardscape and substrate painters, contoured beds, new substrates (fine gravel, river pebbles, planted soil), richer backgrounds, light map, water look, algae film, quality settings
- DONE Starter tanks redecorated so each has its own character

## Milestone 0.4: Clarity, staff, floors and public playtest (DONE 2026-10-03, v0.4.0)

- DONE Tank diagnostics: one source of truth for tank problems with severity, numbers, affected fish, consequences and actions; tank overview at the top of the tank menu; action previews computed from the real simulation; overworld icons from diagnostics (dead, harmful water, sick, hungry, dirty, attention)
- DONE Habitat in numbers: cover %, cave spaces, open swimming space, sand and wood per species
- DONE Help and glossary with sections, icon images, ranges, causes and effects; contextual help links; H key, gamepad and HUD ? button
- DONE Staff: hiring with skills, personalities and wages; Sales, Tank Maintenance, Stock and Floater roles; autonomous work using diagnostics; proposals brought to the player in person; slow skill growth
- DONE Idle Mode: business paused, visuals alive, every transaction locked with the reason, tank view auto-hides its UI
- DONE Floor registry and stairs; customers and staff move between floors; save v3 with migration
- DONE Shop levels: Coldwater & Temperate floor (medaka, rosy barb, hillstream loach, paradise fish), Advanced Aquatics & Marine (German blue ram, ocellaris clownfish, royal gramma, Banggai cardinal; salinity, RO top-off, salt, live rock, skimmers), Basement warehouse and equipment retail (bundles, stock space, equipment customers); Shop Progression screen
- DONE GitHub Pages workflow, env-driven base path, nested-path test, Copy Playtest Report, version shown on title, pause and help

## Milestone 2: Content depth and shop life (NEXT)

Reassessed after Milestone 1.5. Staff, Floor 2 and marine stay later; the core loop now benefits most from variety and texture.

- Species expansion toward 20 to 30, added gradually and each introducing a mechanic: Betta (solitary males, bubble nests), Swordtail (livebearer, jumpers), Harlequin Rasbora (egg layer on leaf undersides), Cherry Barb, Pearl Gourami (bubble nest), Angelfish (pair bonding, tall tanks, eats small fish), German Blue Ram (warm, sensitive), Kribensis (cave pairs, territorial), Apistogramma (harems, soft water), Kuhli Loach (nocturnal, sand), Otocinclus (algae grazer, fragile), Cherry Shrimp (colony breeding, colour grades), Amano Shrimp (algae crew, cannot breed in freshwater), Nerite Snail (eggs never hatch)
- Disease v1 (ich, fin rot) from sustained stress or bad water, with treatments and quarantine
- Breeding tools: breeder box, divider, fry food; genetics hints (expected outcomes of a pairing)
- Events with choices (heatwave, power cut, rare shipment, club visit, big order)
- Customer special orders and repeat customers with home tanks
- Plant depth: light levels, CO2, fertiliser, more plant species and propagation methods (runners, rhizome splits)
- Economy balance with human playtests (see TESTING.md long-run notes)
- DONE in v0.4.0: layouts generalised into a floor registry

## Milestone 3: Staff depth, upgrades and Floor 2 depth (LATER)

- Staff v1 shipped in v0.4.0. Next: dialogue pools, training, breaks and morale, schedules, receiving deliveries
- Shop upgrades (flooring, lighting, racks, signage, display tanks, seating) affecting customer perception
- Floor 2 unlock: planted and larger tanks (180 to 300L), broader tropical range, intermediate fish
- Tank replacement and new tank purchases
- Better aquascaping tools (more plants, hardscape rotation, competitions)

## Milestone 4: Marine depth (LATER)

- Marine v1 shipped in v0.4.0 (salinity as SG, top-off, RO, salt, live rock, skimmer, three marine fish). Next: corals and lighting, alkalinity and calcium, invertebrates, marine staff expertise, specialist marine customers, quarantine and acclimation

## Habitat branch: paludariums and vivariums (LATER, after Milestone 4)

A later progression branch that widens the shop into specialist animal keeping. Not to start before the fish systems are mature.

- **Paludariums** (unlocked on a later floor): split habitat with an aquatic zone and a land/emergent zone; emergent plants, roots, rocks, waterfalls or misting; humidity as a new simulated value alongside water; land planting; suitable aquatic and semi-aquatic inhabitants.
- **Vivariums**: fully terrestrial enclosures with humidity, temperature, substrate, terrestrial plants, climbing structures, hides and lighting; terrestrial inhabitants.
- Architecture prep already in place: habitat rendering reads light colour and water tint from data; plants are architecture-driven; the simulation separates per-tank systems so new environment values can be added as new systems.

## Milestone 5+ (LATER)

Reef systems and corals, shrimp and invertebrates, competitions, breeding rooms, advanced genetics, player-created strains, biotopes, large display tanks, extensive expansion, hundreds of species, customer stories, achievements, long-term goals, desktop/itch.io/Steam/mobile packaging.
