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

## Milestone 0.5: Developer sandbox, mobile, visuals, keeper tools (DONE 2026-10-03, pending merge)

- DONE Developer Sandbox, local only: everything unlocked, presets, separate save namespace; developer tools removed from the public build at build time and verified in `npm run check`
- DONE Hold B to run in the store; held input cleared on blur, hidden tab and page hide; multi-touch controls
- DONE Mobile layout: full-screen responsive game, safe areas, controls beside or below the game, 16 px minimum text, 44 px targets, text size and readable font, menus as sheets, store camera that follows the player with a map view, immersive tank view, tap to move
- DONE Aquarium visuals tied to tank state (pearling, mulm, surface film, hardscape shade and algae, light ramp, reflections), Auto quality, reduced motion, bounded texture caches, profiling tools
- DONE Individual fish "Not for sale"

## Comparison follow-ups (NEXT, ranked; see COMPARISON.md)

From the sourced comparison with Megaquarium, Two Point Hospital, Planet Zoo, Stardew Valley, Supermarket Simulator and others. DONE in this pass: All tanks overview, forgiving animal taps on touch screens.

1. Standing orders for food, salt, supplements and feeders (reorder point per good)
2. Real-device pass on iOS Safari and Android Chrome
3. Floor overlays from diagnostics (water or climate, hunger, cleanliness)
4. Staff suggestions as a badge and inbox, not prompts
5. Automatic feeder for aquariums; a staffing hint when care falls behind
6. Naming, family tree and a collection log of species and morphs
7. Tank menu leads with status and top three issues; score bars under Details
8. Economy model per level; long-run bot learns corals and enclosures; tune levels 5 and 6
9. Commission customers (design a tank or enclosure to a brief)
10. Day report "tomorrow" list and a weekly goal
11. Per-staff job priorities

## Milestone 2: Content depth and shop life

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

## Later expansions, in this order (LATER; roadmap only, not started)

Three separate expansions, each its own milestone with its own systems, art, customers and tests. They come after the fish systems are mature (Milestones 2 to 4) and in this order, because each builds on the one before. None of this is part of the 0.5 work.

### 1. Corals and aquatic invertebrates

STATUS 2026-10-04 (feat/reef-floor, pending merge): first pass DONE as shop level 5 (eight corals, reef chemistry, dosing, fragging, frag rack, eight invertebrates). Still to do: crayfish, mussels, urchins and starfish, copper sensitivity, berried females and colour grades.

Builds on Marine depth (Milestone 4) and the freshwater shrimp in Milestone 2.

- Freshwater invertebrates: shrimp colonies (colour grades, moulting, berried females), snails (pest and ornamental, egg rules), crayfish (escape risk, aggression), mussels (filter feeding)
- Marine invertebrates: cleaner and peppermint shrimp, hermit crabs, snails, urchins, starfish; "reef safe" compatibility with fish
- Corals: soft corals, LPS and SPS with light needs (intensity and spectrum), flow, placement height, colour that reflects health, bleaching, fragging and selling frags
- Water systems: alkalinity, calcium and magnesium uptake, dosing and testing; copper and medication sensitivity for invertebrates
- Equipment: reef lighting, wavemakers, dosing pumps, frag racks
- Rendering: coral growth forms and polyp motion tied to flow and light; invertebrate behaviour (grazing, scavenging, moulting)

### 2. Vivariums, paludariums and related habitats

STATUS 2026-10-04 (feat/vivarium-floor, pending merge): first pass DONE as shop level 6. Vivariums, terrariums and paludariums with humidity, air temperature, basking lamps, UVB, ventilation, substrate moisture, mould, waste, water dishes, calcium, feeder insects, a bioactive clean-up crew, land plants and hides; paludarium pools with real water chemistry; six species (dart frog, White's tree frog, fire-bellied toad, rose hair tarantula, leopard gecko, crested gecko). Still to do from this list: riparium, newts and axolotls, shedding and moulting, temperature gradients beyond the basking spot, feeder cultures as living stock, specialist herp staff skills.

A new habitat branch beside the aquariums, unlocked on a later floor. Builds on the invertebrate systems (feeder insects, moulting) and the per-tank environment systems.

- Enclosure types: paludarium (water zone plus land zone), vivarium and terrarium (fully terrestrial), riparium; dimensions and ventilation matter
- Inhabitants: frogs and other amphibians (dart frogs, tree frogs, newts and axolotls where water-based), spiders and other arachnids (tarantulas), reptiles (geckos and other small lizards), plus land invertebrates (isopods and springtails as clean-up crew)
- New simulated values: air humidity and misting, temperature gradients and basking spots, UVB, substrate moisture, ventilation and mould risk; water quality still applies to the water zone
- Care: live food (feeder insects as stock that needs keeping), shedding and moulting, hides and climbing structures, bioactive substrate
- Plants: emergent and epiphytic plants, mosses and bromeliads; land planting
- Customers and ethics: specialist keepers, welfare and suitability advice, no venomous or restricted species
- Architecture already prepared: habitat rendering reads light colour and water tint from data, plants are architecture-driven, per-tank systems can gain new environment values

### 3. Ant keeping (a dedicated expansion, after the habitats branch)

Roadmap only. Not started, deliberately: it needs its own colony simulation and many-agent rendering.

A distinct expansion with its own simulation rather than a tank variant.

- Formicaria: nest modules and outworlds, nest moisture and temperature, connections between modules
- Colonies: queen, workers and brood stages (eggs, larvae, pupae), colony growth over months, founding colonies
- Feeding: sugars and protein, foraging behaviour visible in the outworld
- Seasons: hibernation (diapause) for temperate species
- Species rules, escape prevention, and selling colonies and setups
- Rendering: ants as many small agents, with their own performance budget

## Milestone 5+ (LATER)

Competitions, breeding rooms, advanced genetics, player-created strains, biotopes, large display tanks, extensive expansion, hundreds of species, customer stories, achievements, long-term goals, desktop/itch.io/Steam/mobile packaging.
