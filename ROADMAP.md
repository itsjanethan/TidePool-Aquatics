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

## Milestone 2: Content depth and shop life (NEXT)

Reassessed after Milestone 1.5. Staff, Floor 2 and marine stay later; the core loop now benefits most from variety and texture.

- Species expansion toward 20 to 30, added gradually and each introducing a mechanic: Betta (solitary males, bubble nests), Swordtail (livebearer, jumpers), Harlequin Rasbora (egg layer on leaf undersides), Cherry Barb, Pearl Gourami (bubble nest), Angelfish (pair bonding, tall tanks, eats small fish), German Blue Ram (warm, sensitive), Kribensis (cave pairs, territorial), Apistogramma (harems, soft water), Kuhli Loach (nocturnal, sand), Otocinclus (algae grazer, fragile), Cherry Shrimp (colony breeding, colour grades), Amano Shrimp (algae crew, cannot breed in freshwater), Nerite Snail (eggs never hatch)
- Disease v1 (ich, fin rot) from sustained stress or bad water, with treatments and quarantine
- Breeding tools: breeder box, divider, fry food; genetics hints (expected outcomes of a pairing)
- Events with choices (heatwave, power cut, rare shipment, club visit, big order)
- Customer special orders and repeat customers with home tanks
- Plant depth: light levels, CO2, fertiliser, more plant species and propagation methods (runners, rhizome splits)
- Economy balance with human playtests (see TESTING.md long-run notes)
- Generalise layouts beyond Floor 1 in code (prerequisite for Milestone 3)

## Milestone 3: Staff, upgrades and Floor 2 (LATER)

- Staff hiring, wages, personalities, skills, weaknesses, dialogue pools, experience
- Task assignment (till, feeding, cleaning, water changes, receiving stock)
- Shop upgrades (flooring, lighting, racks, signage, display tanks, seating) affecting customer perception
- Floor 2 unlock: planted and larger tanks (180 to 300L), broader tropical range, intermediate fish
- Tank replacement and new tank purchases
- Better aquascaping tools (more plants, hardscape rotation, competitions)

## Milestone 4: Marine (LATER)

- Unlock via reputation, knowledge (good advice record), capital and a marine-ready room
- Salinity, specific gravity, top-off, RO water, protein skimmers, live rock cycling
- Marine livestock and marine staff expertise
- Specialist marine customers

## Milestone 5+ (LATER)

Reef systems and corals, shrimp and invertebrates, competitions, breeding rooms, advanced genetics, player-created strains, biotopes, large display tanks, extensive expansion, hundreds of species, customer stories, achievements, long-term goals, desktop/itch.io/Steam/mobile packaging.
