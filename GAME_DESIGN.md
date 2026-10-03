# Game Design

Living document. Describes intent and the rules as currently implemented. When the code and this file disagree, fix one of them in the same change.

## Fantasy

Start with a tiny local fish shop and gradually build it into a thriving specialist aquarium centre full of rare livestock, beautiful display tanks, skilled staff and loyal customers.

## Pillars

1. **Living aquariums.** Every fish is a persistent individual. The inspection view shows those same individuals swimming, feeding, schooling, hiding and growing.
2. **Real husbandry, friendly rules.** Systems follow real fishkeeping logic (cycling, stocking, temperature, compatibility) so experienced keepers recognise it and beginners learn by playing. Realism creates decisions, not tedium.
3. **A shop with people in it.** Customers walk in, browse, ask questions, haggle and come back. Advice matters as much as stock.
4. **Steady, earned growth.** Unlocks come from accomplishments (reputation, knowledge, bred fish), not arbitrary levels.

Priority order for all work: playable, understandable, enjoyable, stable, expandable, content-rich.

## Core loop

Buy livestock and supplies, maintain tanks, feed and grow fish, (later) breed and improve fish, serve customers, sell livestock, earn money and reputation, upgrade the shop, unlock new systems and species.

Overlapping goals at all times: keep tanks healthy, keep stock levels up, serve and advise customers, improve aquascapes, hit the current objective.

## Time

- 1 real second = 2 in-game minutes at 1x (2x and 4x available, key T).
- Shop opens 09:00 and closes 18:00 (about 4.5 real minutes per open day at 1x).
- Lights are on 08:00 to 20:00; fish behave differently at night.
- 28-day seasons, 4 seasons per year (112 days). Seasons change ambient temperature (unheated tanks follow it) and will later drive demand and events.
- Time pauses while blocking menus or dialogue are open. It keeps running in the tank inspection view.
- Player actions cost time (a 25% water change on 60L takes about 20 minutes), which makes chores a real trade-off against serving customers.
- Ending the day (door or office PC) simulates the night and skips to 09:00. Rent and electricity are charged at midnight; deliveries arrive at opening; a daily report is shown; the game autosaves.

## Tanks and water

Each tank has volume, length, filter, optional heater (with setpoint and failure state), optional air stone, substrate, background and decor.

Water parameters: temperature, pH, hardness (dGH), ammonia, nitrite, nitrate, oxygen, detritus, cloudiness, and two bacteria populations (ammonia oxidisers and nitrite oxidisers) stored as maturity 0..1.

Nitrogen cycle (see `src/sim/water.ts`):
- Fish excrete ammonia proportional to `wasteFactor x size^2`. Eaten food adds a little more.
- Uneaten food rots into detritus; detritus mineralises into ammonia. Dead fish rot fast.
- Bacteria convert ammonia to nitrite and nitrite to nitrate, limited by filter capacity x filter condition x maturity.
- Bacteria grow logistically toward the level the bioload needs, only when their food is present, so a new tank needs an ammonia source (fish, ghost feeding or bacteria starter). Nitrite oxidisers lag behind, giving the classic ammonia spike then nitrite spike.
- A tank counts as "cycled" when both populations are established and ammonia and nitrite read near zero.
- Adding many fish to a lightly stocked tank causes a mini-cycle.
- Plants absorb nitrate (and some ammonia) and compete with algae.
- Nitrate slowly acidifies the water; wood lowers pH, limestone raises pH and hardness.
- Water changes dilute everything toward tap water (pH 7.5, 10 dGH).

Toxicity is thresholded: low readings cause stress, damaging levels cost health over hours to days, giving the player time to react.

Neglect is visible: algae and glass dirt overlays, cloudy water, dimmer overworld tanks, status icons above tanks (red "!" for dead fish or toxic water, yellow dots for hunger, green for dirt).

## Fish

Each fish is an entity with species, morph, sex, age, size, individual adult size, health, hunger, stress, transient shock, genes (allele loci, quality and size), temperament, breeding readiness, generation, parents, origin, purchase cost, tank history and more. See `SAVE_SCHEMA.md`.

- **Hunger** rises about 3 points per hour, faster in warm water. Above 70 growth stops; above 75 health drops.
- **Growth** is logistic toward the individual's adult size, scaled by feeding, health, stress, temperature fit and tank size (undersized tanks stunt).
- **Stress** moves toward a target computed from water quality, temperature and pH fit, group size, tank size, overcrowding, cover for shy species, habitat needs (caves, wood, sand), harassment by tank mates (aggression, fin nipping, large mouths) and hunger.
- **Health** falls under environmental damage and recovers in good conditions. At zero the fish dies and becomes a corpse that pollutes the tank until removed (or rots away after a few days).
- **Value** depends on species base price, morph multiplier, size, quality and health.

Stocking: capacity is roughly 0.8 effective cm per litre, adjusted for filter rating. Shown as a percentage in the tank menu.

The fish card uses progressive disclosure: name, sex, life stage, size, health, fullness, stress, quality stars and value first, with "Bothered by" when something is wrong; then About (age, look, origin, strain), Breeding (condition, pregnancy, method), Family (mother, father, offspring), Traits (visible genes; carried genes once known) and Care. Q / E scroll.

## Breeding and genetics

Breeding is driven by species data (`breeding.method`) and needs mature, healthy, unstressed, fed adults of both sexes whose `breedingReadiness` has built up over days of good conditions.

- **Livebearers** (guppy, endler, platy, molly): a ready female becomes pregnant (gravid for about 7 to 10 days) and gives birth to free-swimming fry.
- **Egg scatterers** (neon, danio, white cloud, goldfish): a pair spawns among plants; adults eat many eggs unless there is dense plant cover. Neons also need soft water; goldfish spawn in spring.
- **Adhesive eggs** (bronze cory): spawning is triggered by a cool water change.
- **Cave spawners** (bristlenose): need a cave; the male guards the eggs, so survival is high.

Fry are full fish entities with both parents, inherited genes, generation and growth from birth size. Adults hunt small fry each hour; plant cover shields them. Moving fry to their own tank (grow-out) or switching a tank's "Customers can buy" to No (breeding tank) is how the player manages this. The Breeding screen in each tank menu says what is helping and what is stopping each species.

Genetics: each species has a few Mendelian loci (colour, pattern, fins, albinism) with dominance; the visible look (morph) is derived from the genotype. Supplier fish show only their look. Hidden carried genes are revealed for shop-bred fish and for any fish once it has offspring. Quality and size are polygenic: offspring take the parents' mean with noise and mild regression toward average. Rare mutations (0.4% per allele) create surprises.

Strains: a shop-bred F2 or later fish whose two parents are shop-bred and show the same look can found a named strain. Related fish join it, and fry of two strain parents that show the look stay in the line (e.g. "Jan's Red Delta F4"). Bred fish are worth 10% more; strains add 8% per generation, capped at 40%.

## Plants

Plants are living items: each has a size (growth), health and a species growth rate and maximum. They grow with light and nutrients (nitrate) and grow slower as they get big. Stages: Cutting, Small, Medium, Large, Mature, Overgrown (shades the tank). Larger plants give more cover and nitrate uptake.

Propagation: take a small, medium or large cutting (bigger cuttings sell for more but set the parent back further; the parent never drops below a healthy minimum), or trim overgrowth. Cuttings go to the stockroom as potted plants. From there they can be replanted in any tank to grow on, offered to customers at the till (or picked up by browsers from the plant shelf), or sold in bulk to the trade buyer. Home-grown plants cost nothing, so they are pure margin compared with buying stock.

## Aquascaping

Decor: plants (cover, nitrate uptake, fry cover), rocks, wood (pH, needed by plecos), caves (territories, cave spawners). Substrate and background add to the score.

Every change can be previewed in the tank before confirming: substrate and background swap live, decor and plants show a ghost at the placement spot. Cancel restores the tank exactly. Owned substrates and backgrounds are free to switch back to and show "Owned"; removed decor goes to the stockroom ("Java Fern ×3") and can be placed again in any tank.

The layout score rewards variety, a moderate fill level, horizontal spread, layering and item beauty. The shown score subtracts algae, glass dirt and cloudiness. Layout feeds the Aquascaping reputation; shown beauty affects customer reactions. Goldfish damage soft plants over time.

## Customers

Customers are simulated entities on the shop grid (`src/sim/customers.ts`).

Archetypes: New Fishkeeper, Hobbyist, Family Visit, Enthusiast, Bargain Hunter. Each has trait ranges (budget, experience, patience, negotiation, ethics, quality focus), favourite species, typical tank sizes and goal weights.

Goals:
- **browse**: visits 2 to 4 tanks, may pick appealing fish within budget and price tolerance.
- **buy_specific**: wants N of a named species; disappointed if out of stock.
- **advice_stocking**: describes their tank (litres, heated or not) and asks what to keep. The player picks a species from stock or says nothing suits. Good advice raises Expert Advice reputation and makes a sale. Bad advice may still sell (short-term money) but experienced customers notice, and trusting customers come back later with a complaint.
- **problem**: describes a husbandry problem with three possible answers. The right answer builds reputation and may sell a dry good.

Customers react to what they see: dead fish, sick fish, dirty tanks and beautiful tanks all change satisfaction and nudge reputation. They have limited patience while queueing or waiting for help.

At the till: ring up, give 10% off, suggest an add-on (water conditioner, test kit, flake food) or refuse. Some customers haggle; the player can accept, meet halfway or hold firm.

Returning customers keep a profile with visits, loyalty and total spent. Loyal customers have higher budgets and come back more often.

## Reputation

Seven dimensions: Livestock Quality, Fish Welfare, Customer Service, Cleanliness, Aquascaping, Value for Money, Expert Advice. Welfare, quality, cleanliness and aquascaping drift daily toward measured values from the tanks; service, value and advice move with interactions. Positive changes have strong diminishing returns. Overall reputation (shown as stars) drives customer arrival rate; enthusiasts appear more as quality rises.

## Economy

- Start: £400, 600 food portions, a few dry goods.
- Daily costs: rent £25 plus electricity per tank (filter, heater, air pump).
- Livestock from suppliers: Riverside Aquatic Wholesale (cheap, next day, variable quality) and Highfield Fish Farm (pricier, better quality, two days, smaller range, minimum order). Stock rotates weekly with occasional shortages.
- Prices: the player sets a base price per species; each fish's price scales with its size, colour morph, quality and health. Customers judge price against typical retail and the shop's reputation.
- Dry goods are bought in packs and sold as add-ons or after good advice.
- Livestock orders are a cart: each line has its own quantity and destination tank. Before ordering, each line is checked (cycled, capacity including other lines to the same tank, temperature, pH, hardness, water type, compatibility, group size). Warnings inform but never block. Deliveries arrive at opening time.
- Demand: selling many of one species saturates demand (browsers less likely to buy it) until it recovers over days.
- Trade buyer: takes surplus fish (35% of value, fry less) and potted plants (50%) at any time.
- Tanks marked "Customers can buy: No" are never sold from (breeding and grow-out tanks).

## Saving

Saving happens at the office PC (Save, Load, Export, Import, Settings, Statistics). The pause menu shows when the game was last saved and points to the PC. The game autosaves every morning at opening (09:00) after the overnight update; a small indicator under the money confirms it. Quitting warns how much progress would be lost.

The balance test bot (tests/balance.test.ts) represents near-perfect play and should earn a moderate profit over three weeks without fish deaths. Real players will earn less.

## Progression (vertical slice)

Starter goals guide the first sessions: feed a tank, inspect an aquarium, serve a customer, give good advice, order livestock, cycle tank C2, build a beautiful tank, serve 10 customers, reach 2.5 stars, save £1,500. Some pay small cash rewards.

Planned unlock path: Floor 2 (planted and larger tanks, broader tropical range), Floor 3 (advanced freshwater: discus, cichlids, oddballs, high-tech planted), Floor 4 (marine), Floor 5 (reef, corals, inverts), then breeding facilities and display tanks. Marine should require demonstrated knowledge and reputation, plus capital, rather than a level number.

## Starter shop

Ten tanks on one floor:

- A1 40L heated: guppies. A2 40L heated: endlers. A3 40L unheated: white clouds.
- A4 60L heated: neon tetras. A5 60L heated: platies. A6 60L unheated: zebra danios.
- B1 120L heated, sand, wood and cave: bronze corydoras and bristlenose plecos.
- B2 120L unheated: fancy goldfish.
- C1 60L heated with limestone: mollies.
- C2 60L heated, bare and uncycled: the teaching tank.

## Planned systems (not yet built)

Disease, events, more species (each adding a mechanic), breeding tools, plant depth (light, CO2), staff, shop upgrades, more floors, marine and reef. See `ROADMAP.md`.
