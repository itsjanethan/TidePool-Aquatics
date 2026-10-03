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

Every fish looks like itself: its genes, sex, age, size, quality, pregnancy and health all show in the tank view (see ART_DIRECTION.md). A breeder can pick promising juveniles by eye.

Genetics: each species has a few Mendelian loci (colour, pattern, fins, albinism) with dominance; the visible look (morph) is derived from the genotype. Supplier fish show only their look. Hidden carried genes are revealed for shop-bred fish and for any fish once it has offspring. Quality and size are polygenic: offspring take the parents' mean with noise and mild regression toward average. Rare mutations (0.4% per allele) create surprises.

Strains: a shop-bred F2 or later fish whose two parents are shop-bred and show the same look can found a named strain. Related fish join it, and fry of two strain parents that show the look stay in the line (e.g. "Jan's Red Delta F4"). Bred fish are worth 10% more; strains add 8% per generation, capped at 40%.

## Plants

Plants are living items: each has a size (growth), health and a species growth rate and maximum. They grow with light and nutrients (nitrate) and grow slower as they get big. Stages: Cutting, Small, Medium, Large, Mature, Overgrown (shades the tank). Larger plants give more cover and nitrate uptake.

Propagation: take a small, medium or large cutting (bigger cuttings sell for more but set the parent back further; the parent never drops below a healthy minimum), or trim overgrowth. Cuttings go to the stockroom as potted plants. From there they can be replanted in any tank to grow on, offered to customers at the till (or picked up by browsers from the plant shelf), or sold in bulk to the trade buyer. Home-grown plants cost nothing, so they are pure margin compared with buying stock.

### Floating plants

Duckweed, Amazon Frogbit and Red Root Floater live on the surface as coverage rather than single items. They spread on their own with light and nitrate (duckweed fastest), soak up nitrate, give fry cover and shade the tank, slowing plants and algae below. A light cover looks natural; a carpet starves the plants underneath and hides the tank. Scoop half into the stockroom (to float in another tank or sell to the trade buyer) or scoop most and bin it. Buy new portions from Aquascape.

Plant species propagate differently (cuttings, runner plantlets, rhizome pieces, clumps); the menus use the right words and the data allows species-specific mechanics later.

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

## Tank status and diagnostics

The player should never have to guess why a tank has a warning. Every tank has one diagnosis: an overall status (Good, Needs attention, Urgent, Empty), five scores (fish welfare, water, cleanliness, habitat, stocking) and a list of issues ordered critical, warning, advice. Each issue states the number now, what is recommended, which fish are affected, what it leads to and what helps. One-step fixes show their predicted effect ("Glass dirt 68% → 0% · 8 min"), computed by running the real action on a copy of the game. The overworld bubble shows the top issue's icon: dead fish, harmful water, sick fish, hungry, needs cleaning, or attention. A sick fish in good water is "sick", never "toxic".

Habitat is in numbers: hiding cover as a percent against the strictest species' need ("Hiding cover 12% / 55% recommended"), cave spaces against adult cave dwellers ("Cave spaces 1 / 3"), open swimming space, sand and wood.

## Help

Help (H, gamepad LT or right-stick click, or the ? button) covers Controls, Tank Status, Symbols & Icons, Water Chemistry, Fish Needs, Habitat & Aquascaping, Breeding & Genetics, Plants, Customers, Staff, Shop Progression, Marine, Saving, Idle Mode and Playtest. Entries give ranges, what affects a value and what it affects. Screens link to entries in context (underlined words for the mouse, "Help: ..." rows for keyboard and gamepad).

## Staff

Staff are people in the shop, not menu buffs. Each has a name, a look (blue shop polo and name tag), a personality, a daily wage, four skills (cleaning, service, speed, knowledge) and a role. Personalities are trade-offs: Meticulous (thorough, slow), Chatty (great with customers, distracted), Speedy (fast, cuts corners), Fish nerd (excellent advice, awkward), Steady (no weak spots, learns slowly), Eager (cheap, learns fast, beginner mistakes). Skills grow slowly with practice.

- **Sales** serve the till when the player is not there and walk to customers with questions anywhere in the shop. Knowledge decides whether the advice is right; service decides how happy the customer is and how quickly it goes.
- **Tank Maintenance** work through the diagnostics by severity: dead fish and toxins first, then feeding and top-offs, then cleaning. A worker's cleaning skill and personality decide how thorough the job is.
- **Stock** watch demand, shop stock and supplier lists and bring order suggestions.
- **Floaters** go where they are needed: queues and questions first, then tank jobs.

Any member of staff can be kept to one floor ("Works on") or allowed anywhere. Each personality has its own lines as well as the shared ones.

Staff never spend money on their own. When they have a suggestion (an order, or a decor item for a tank lacking cover or caves) they walk up to the player: Approve order / Review order / Not now (or Go ahead / Show me / Leave it for aquascape ideas). Review lets the player edit the order quantity. Suggestions show species, quantity, supplier, destination, cost, the reason and any warnings; aquascape suggestions show the effect predicted by the real simulation. They also wait in Suggestions at the office PC. Staff work 08:30 to 18:30 and are paid nightly with the rent. See STAFF.md.

## Idle Mode

Idle Mode is for watching the shop without running it: Idle Mode = paused persistent simulation + active visual animation. Entered from the pause menu or the office PC, it freezes the clock, hunger, water, growth, breeding, pregnancies, customers, staff work, wages, rent, deliveries and progression. Fish swim, plants sway and the light moves. Every transaction is locked and says so ("Unavailable in Idle Mode"). The player can walk every floor and inspect tanks, fish, genetics, lineage, strains, plants, diagnostics and help. The HUD shows "IDLE MODE · BUSINESS PAUSED"; "Resume Business" ends it. In the tank view the UI fades after a few quiet seconds (Hide UI also works any time). Saving while idle is safe; loading always resumes normal play.

## Progression and shop levels

Starter goals guide the first sessions: feed a tank, inspect an aquarium, serve a customer, give good advice, order livestock, cycle tank C2, build a beautiful tank, serve 10 customers, reach 2.5 stars, save £1,500. Some pay small cash rewards.

Shop levels are bought at the PC (Shop Progression) once their requirements are met (reputation, customers served, capital, goals, and for level 3 fish bred):

1. **Starter shop** (ground floor, ten tanks).
2. **Coldwater & Temperate** (upstairs): six 200L and 300L unheated tanks; medaka, rosy barb, hillstream loach, paradise fish; a temperate supplier.
3. **Advanced Aquatics & Marine**: three marine systems and three specialist tropical tanks; German blue ram, ocellaris clownfish, royal gramma, Banggai cardinal; marine supplies. Marine water has salinity (shown as SG 1.024 to 1.026), evaporates (top off with RO water, never salt water), needs salt mix for water changes, benefits from live rock and a protein skimmer, and is strictly separate from freshwater.
4. **Basement Warehouse & Retail**: equipment racks (aquariums, filters and media, heaters, air pumps and stones, lighting, substrate, nets and gravel vacuums, marine kit) and setup bundles (40L Tropical Starter, 60L Community Starter, Planted Tank Starter, a 120L Coldwater Setup sized for goldfish welfare, a 120L Community Kit and a Marine Starter once marine is open). Stock space rises from 40 to 240 and two quarantine tanks are added. Some customers come in just for equipment ("I need a heater for my 100L tank", "My air pump has died"); bigger or unfamiliar purchases start with a question, answered by the player or by staff. Offering the right bundle or parts pleases them; a plausible but wrong item (a 50W heater for a 100L tank) may be spotted by an experienced customer. Bundles cost a little more to buy in but carry a better margin and appeal to beginners.

Level 3 also needs an Expert Advice reputation of 55. Each level adds rent; a bigger shop draws more customers. Later: reef and corals, breeding facilities, display tanks.

## Starter shop

Ten tanks on one floor:

- A1 40L heated: guppies. A2 40L heated: endlers. A3 40L unheated: white clouds.
- A4 60L heated: neon tetras. A5 60L heated: platies. A6 60L unheated: zebra danios.
- B1 120L heated, sand, wood and cave: bronze corydoras and bristlenose plecos.
- B2 120L unheated: fancy goldfish.
- C1 60L heated with limestone: mollies.
- C2 60L heated, bare and uncycled: the teaching tank.

## Planned systems (not yet built)

Disease, events, more species (each adding a mechanic), breeding tools, plant depth (light, CO2), staff depth (training, morale), shop upgrades, reef. See `ROADMAP.md`.
