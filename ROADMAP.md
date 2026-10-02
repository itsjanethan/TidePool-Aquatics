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
- NEXT Audio (ambient bubbles, UI blips, till sound)
- NEXT Touch controls for phones and tablets
- NEXT Balance pass with human playtesters

## Milestone 2: Breeding, genetics and deeper simulation (NEXT)

- Breeding system: livebearers (pregnancy, fry, fry survival vs cover and predation), then egg scatterers and adhesive eggs, then cave spawners
- Genetics: Mendelian loci per species (colour, pattern, fin type, albinism), polygenic quality and size, rare mutations
- Lineage, generations (F1..Fn), strain naming
- Breeding tank tools (breeder boxes, separating parents and fry)
- Disease system (ich, fin rot, bloat) triggered by stress and poor water; treatments
- More species: 20 to 30 total, including bettas, gouramis, angelfish, cherry shrimp, kuhli loach, harlequin rasbora, cardinal tetra, otocinclus, ram cichlid, panda cory
- Deeper customers: repeat customers with their own home tank state, special orders, aquarium club members
- Supplier opportunities (rare shipments)
- Improved water: CO2 and plant growth, temperature effects on oxygen, seasonal ambient swings
- Events: heatwave, power cut, equipment failure, disease outbreak, club visit, social media surge, big order (each a decision, not a punishment)
- Generalise layouts beyond Floor 1 in code

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
