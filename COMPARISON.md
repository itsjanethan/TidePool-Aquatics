# TidePool Aquatics compared with successful management and pet games

Written 2026-10-04 against the code on `feat/comparison-quick-wins` (stacked on the vivarium floor). The evidence is a sourced research pass over Megaquarium, Aquarist, Fish Tycoon, Stardew Valley, Two Point Hospital and Campus, Planet Zoo, Animal Crossing: New Horizons, Supermarket Simulator, the Pet Shop Simulator games, Tap Tap Fish AbyssRium, Fishdom and Viridi, plus design and mobile UX writing. Sources are listed at the end as [S1] to [S54]. Our own observations come from the sandbox, week-long simulations and screenshots made this iteration.

Effort: S is a day or less, M a few days, L a week or more. Impact is on a typical player's experience.

## Summary

TidePool is already strong where the best games are strong: one source of truth for what is wrong with a tank, numbers with every warning, compatibility checks when ordering, and staff that work from the same diagnostics. Its weak spots are the ones critics also name in Megaquarium and Supermarket Simulator: no single view of every tank (fixed now), consumables that run out and become a chore, suggestions that arrive as prompts, and little to attach the player to individual animals beyond genetics.

Fixed in this iteration because of this comparison:

1. **All tanks overview** (office PC and pause menu): every tank on every floor, its status coloured by severity and its worst problems, most urgent first or floor by floor; pick one to open its menu. Megaquarium was criticised for having no overview of all tanks [S4]; Two Point Hospital's map-wide views are the benchmark [S27].
2. **Taps that just miss an animal still select it** (tank view): the nearest animal within about a fingertip (26 CSS px) is picked. Small precise targets were a main complaint about Aquarist [S17][S18]; touch targets should be at least 44 CSS px [S49][S50]. Checked in emulation at 390x844 on a cherry shrimp colony: four taps 16 px off target all selected a shrimp (two the target, two its neighbour), none missed.
3. Earlier in this iteration and directly on these lessons: aquascape items explain what they give and change, from the real scoring (Planet Zoo lists each item's contribution [S13][S14]); livestock on order is shown per destination tank with projected stocking and warnings at the point of ordering (Megaquarium's missing predation warning [S4], Supermarket Simulator's broken delivery chain [S36]); rapid taps no longer zoom the page on phones.

## Findings by dimension

### 1. Clarity of system state

What works elsewhere: one variable per overlay, green to red, across the whole map [S27]; per-animal tabs with bars that turn green when a need is met [S13][S14]; a marker on the object itself when it needs you [S22]. What fails: too many dials ("spreadsheet safari" [S11]), unexplained icons [S20], and parameters whose effect is unclear [S3]. Working memory holds about three new items while learning [S46].

TidePool: diagnostics give each tank a status, issues with severity, numbers, affected animals, consequences and actions; overworld icons show the worst; previews show the effect of a fix before doing it; the glossary explains every number. New systems (reef chemistry, enclosure climate) reuse the same issue format and panels (as Freshwater Frenzy did with pH [S10]).

Gaps: no floor-wide overlays; reef care shows many numbers at once (risk of [S11]); the tank menu leads with five score bars, which is more than the three-item guideline for new players [S46].

### 2. Ordering and stocking

What works: order from a computer, delivered next day [S35]; a whole chain that staff can run, or players end up hauling boxes [S36]; snapping items into place [S39]. What fails: carrying stock by hand with a tiny cursor [S17][S18]. Megaquarium skips delivery fiction entirely [S1][S3].

TidePool: orders name a destination tank, arrive at opening on their day straight into it, show in that tank and in the order flow, and are checked for compatibility and stocking including orders already placed. Dry goods (food, salt, supplements, feeders) are bought one by one in the stockroom.

Gap: consumables (fish food, salt, reef supplements and now feeder insects) are bought one at a time in the stockroom with no reorder point, and a dosing pump simply stops when its supplement runs out. Each new floor adds more of these.

### 3. Daily loop and session length

What works: a day that ends in sleep and an autosave, with longer seasonal goals [S24]; terms with a calm planning window [S30][S31]. Median mobile sessions are 5 to 6 minutes, about four a day [S54]. Waiting with nothing to do was a criticism of Megaquarium [S5] and early Animal Crossing [S32].

TidePool: 2 game minutes per real second, open 09:00 to 18:00 (about 4.5 real minutes), end of day report, autosave at opening, goals. This already fits a mobile session.

Gap: the day report lists money and reputation but not "what to do tomorrow"; there is no weekly arc beyond goals and expansions.

### 4. Chores and choices

What works: earning your way out of a chore with an upgrade (sprinklers [S23]); systems that run themselves with occasional meaningful requests (fish ponds [S22]). A decision is interesting only if it involves a trade-off [S44]; loops go stale without variation [S45]. Requests with no consequence feel empty [S47].

TidePool: staff take over feeding, water changes and cleaning from diagnostics; dosing pumps, automatic misters and a bioactive clean-up crew remove specific chores; the remaining manual care has visible trade-offs (feeding amount vs water quality, vents vs humidity vs mould).

Gaps: no automatic feeder for aquariums (the most repeated early chore); the vivarium adds daily feeder and dish chores, which staff do cover but which compete with other jobs. Care load grows with the shop, as critics saw in Megaquarium [S4]; in our week-long sandbox runs (four staff, about 45 tanks) staff kept every animal fed, but the land animals were usually 60 to 70% hungry by each morning.

### 5. Economy and pacing

What works: several currencies with clear purposes (cash, research points, prestige) [S3]; penalising duplicate exhibits to push variety [S7]; new venues that introduce one concept each [S26]; mapping faucets and sinks before building [S48].

TidePool: money, reputation in several dimensions and knowledge; shop levels gated by reputation, customers served, capital, fish bred and knowledge; species demand saturates, pushing variety; long-run simulations check money and survival.

Gap: no explicit faucet and sink model; levels 5 and 6 have not been balanced by a human or by the long-run bot (it does not use corals or enclosures yet).

### 6. Customers

What works: clear needs views [S12]; customers who want a specific thing, like a tank for a client [S16]; feedback that names the fix. Complaints that feel random are a common frustration [S37].

TidePool: archetypes with goals (including reef and herp keepers), advice and setups, sales by hand or by staff, reputation per dimension.

Gaps: no commission jobs (design a tank for someone); repeat customers with home tanks are on the roadmap.

### 7. Breeding and attachment

What works: discovery goals and a sales holding tank [S19][S20]; per-species breeding triggers [S10]; genetics and inbreeding [S11][S15]; a curated collection with a line of flavour per specimen [S33][S34]. Players invent their own naming schemes when there are no lineage tools [S15].

TidePool: genetics, morphs, strains, persistent fry with parents, realistic breeding needs per species, individual "not for sale".

Gaps: animals cannot be named; there is no family tree view and no collection or codex of species and morphs discovered.

### 8. Staff and automation

What works: autonomous staff that remove busywork [S26]; zones, priorities and specialisms [S7][S8]; training that does not interrupt [S6]. Staff wandering from their assignments read as broken [S31].

TidePool: hiring with skills and personalities, four roles, a floor assignment, work chosen from diagnostics, slow skill growth, suggestions brought to the player in person.

Gaps: suggestions are queued prompts that appear when the player is free; Megaquarium players asked for a badge or inbox instead [S6]. No per-staff job priorities beyond role and floor.

### 9. Habitat feedback

What works: requirement categories per species (temperature, space, water, terrain, decor variety, shoal size, solitary) [S9]; green bars when met [S13][S14]; predation warnings when choosing stock [S4].

TidePool: cover %, caves, open swimming space, sand and wood per species, coral light and flow by height, enclosure humidity, heat, air, hides and climbing, all with numbers, plus live previews while aquascaping. This is at or above the reference games.

### 10. Mobile

What works: 44 to 48 px targets [S49][S50]; primary actions in the thumb zone and one-handed play [S51][S52]; portrait is common for casual play [S53]; short sessions [S54]. Desktop ports without UI scaling feel tiny [S29].

TidePool: responsive layout, 44 px targets, text size setting, controls below the game in portrait and beside it in landscape, tap to move, immersive tank view, and now forgiving animal taps and no accidental zoom.

Gap: nothing has been tried on a real phone yet; all checks are Chromium emulation.

## Ranked next steps

| Rank | Change | Impact | Effort | Depends on | Evidence |
|---|---|---|---|---|---|
| 1 | Standing orders for food, salt, supplements and feeders: a reorder point per good, delivered with livestock, warning when money is short | High | M | Stockroom, deliveries | [S36], [S23]; more consumables on every new floor |
| 2 | Real-device pass on iOS Safari and Android Chrome (rotation, browser bars, d-pad plus B, tap selection, tank view frame time) | High | S | Phones | [S49]-[S52], [S29] |
| 3 | Floor overlays: colour every tank on the map by water or climate, hunger and cleanliness, from diagnostics | High | M | Diagnostics, overworld | [S27], [S4] |
| 4 | Staff suggestions as a badge and inbox (HUD and office PC), no prompt unless urgent | Medium | S | Staff proposals | [S6] |
| 5 | Automatic feeder for aquariums (holds a few days of food, can overfeed if set high), and a staffing hint when care falls behind | Medium | S | Equipment, feeding, staff | [S23], [S44], [S4] |
| 6 | Naming, family tree and a collection log of species and morphs with a line of flavour each | High | M | Genetics, fish detail | [S15], [S19], [S33] |
| 7 | Lead the tank menu with the status and the top three issues; fold the five score bars behind "Details" for new players | Medium | S | Diagnostics UI | [S46], [S11] |
| 8 | Economy model (faucets and sinks per level) and teach the long-run bot corals and enclosures; tune levels 5 and 6 | Medium | M | Long-run tests | [S48], [S26] |
| 9 | Commission customers: design a tank or enclosure to a brief for a fee and reputation | Medium | M | Customers, aquascape scoring | [S16], [S37] |
| 10 | Day report "tomorrow" list (deliveries, stock running low, tanks needing work) and a weekly goal | Medium | S | Day report, rank 1 | [S24], [S30] |
| 11 | Per-staff job priorities within a role | Low | M | Staff | [S7], [S8] |

Ant keeping stays roadmap only.

## Defects found while testing this iteration (fixed)

- Crested geckos could not be fed: their feeder was looked up under the wrong stockroom id, so staff never fed them and they starved (fixed with a feeder-to-stock map).
- White's tree frogs bred in an ordinary vivarium (their rain-chamber need was ignored) and then died of crowding; toads could breed without a pool. Breeding now enforces both, and humidity and calcium weaken land breeding.
- The automatic mister pushed every humid enclosure to 100% humidity; it now tops the substrate up toward damp.
- Enclosures sat at the shop's unheated temperature (about 19°C), too cold for frogs; the vivarium floor is now a heated room (23.5°C).
- Spot cleaning stayed "advice" (which staff skip) until waste was high enough to hurt animals; staff now pick up enclosure waste and dish jobs at advice level too.

## Sources

- S1. Megaquarium, Steam store page. https://store.steampowered.com/app/600480/Megaquarium/
- S2. Megaquarium, Wikipedia. https://en.wikipedia.org/wiki/Megaquarium
- S3. Megaquarium review, PC Gamer. https://www.pcgamer.com/megaquarium-review/
- S4. Megaquarium review, Cubed3. https://www.cubed3.com/games/reviews/pc/megaquarium
- S5. Megaquarium indie game review, Geeky Hobbies. https://www.geekyhobbies.com/megaquarium-indie-game-review/
- S6. "Opinion: Staff Training Is Too Intrusive", Megaquarium Steam discussions. https://steamcommunity.com/app/600480/discussions/0/1741094390469999729/
- S7. Megaquarium Tips and Tricks, Steam Community guide. https://steamcommunity.com/sharedfiles/filedetails/?id=1861551886
- S8. Five Tips for Building the Perfect Fish Zoo in Megaquarium, Xbox Wire. https://news.xbox.com/en-us/2019/10/21/five-tips-building-perfect-fish-zoo-megaquarium-xbox-one/
- S9. The Ultimate Animal Guide (Architect's Collection), Steam Community guide. https://steamcommunity.com/sharedfiles/filedetails/?id=2652627470
- S10. Megaquarium: Freshwater Frenzy review, TheXboxHub. https://www.thexboxhub.com/megaquarium-freshwater-frenzy-review/
- S11. Planet Zoo, Wikipedia. https://en.wikipedia.org/wiki/Planet_Zoo
- S12. A Beginner's Guide to Planet Zoo: Managing your zoo, Frontier help centre. https://one.planetzoogame.com/help-centre/player-guides/managing-your-zoo
- S13. Planet Zoo: The Comprehensive Guide, Steam Community guide. https://steamcommunity.com/sharedfiles/filedetails/?id=1910776223
- S14. Planet Zoo beginner's guide to habitats, exhibits and animal care, TheGamer. https://www.thegamer.com/planet-zoo-beginners-guide-habitats-exhibits-animal-care/
- S15. Planet Zoo: 15 tips for breeding perfect animals, TheGamer. https://www.thegamer.com/planet-zoo-breeding-guide/
- S16. Aquarist, Steam store page. https://store.steampowered.com/app/1430760/Aquarist/
- S17. Review: Aquarist (Switch), WayTooManyGames. https://waytoomany.games/2022/10/19/review-aquarist-switch/
- S18. Review: Aquarist (Nintendo Switch), Pure Nintendo. https://purenintendo.com/review-aquarist-nintendo-switch/
- S19. Fish Tycoon, Wikipedia. https://en.wikipedia.org/wiki/Fish_Tycoon
- S20. Fish Tycoon review, Gamezebo. https://www.gamezebo.com/reviews/fish-tycoon-review/
- S21. Fish Tycoon 2: Virtual Aquarium, Steam store page. https://store.steampowered.com/app/845250/Fish_Tycoon_2_Virtual_Aquarium/
- S22. Fish Pond, Stardew Valley Wiki. https://stardewvalleywiki.com/Fish_Pond
- S23. Stardew Valley sprinklers guide, Theria Games. https://theriagames.com/guide/stardew-valley-sprinklers/
- S24. Stardew Valley, Wikipedia. https://en.wikipedia.org/wiki/Stardew_Valley
- S25. Two Point Hospital, Wikipedia. https://en.wikipedia.org/wiki/Two_Point_Hospital
- S26. Two Point Hospital review, God is a Geek. https://www.godisageek.com/reviews/two-point-hospital-review/
- S27. Visualisation Modes, Two Point Hospital Wiki. https://two-point-hospital.fandom.com/wiki/Visualisation_Modes
- S28. Staff Training, Two Point Hospital Wiki. https://two-point-hospital.fandom.com/wiki/Staff_Training
- S29. Two Point Hospital console review, TheSixthAxis. https://www.thesixthaxis.com/2020/02/21/two-point-hospital-console-review-ps4-switch-xbox-one/
- S30. Two Point Campus, Wikipedia. https://en.wikipedia.org/wiki/Two_Point_Campus
- S31. Two Point Campus review, Twinfinite. https://twinfinite.net/reviews/two-point-campus-review/
- S32. Animal Crossing: New Horizons, Wikipedia. https://en.wikipedia.org/wiki/Animal_Crossing:_New_Horizons
- S33. Museum, Nookipedia. https://nookipedia.com/wiki/Museum
- S34. "The Museum in Animal Crossing", Play the Past. https://www.playthepast.org/?p=6880
- S35. Supermarket Simulator tips on restocking and shelving, GameLeap. https://www.gameleap.com/articles/supermarket-simulator-tips-how-to-deal-with-restocking-and-shelving-products
- S36. "Restockers and delivered boxes", Supermarket Simulator Steam discussions. https://steamcommunity.com/app/2670630/discussions/0/7607215003626336767/
- S37. "What's with the customer complaint algorithm?", Supermarket Simulator Steam discussions. https://steamcommunity.com/app/2670630/discussions/0/6361972497304008604/?l=english
- S38. Exotica 2: Pet Shop Simulator, Steam store page. https://store.steampowered.com/app/2824380/Pet_Shop_Simulator_2/
- S39. Pet Shop Simulator Prologue review, KeenGamer. https://www.keengamer.com/articles/previews/pet-shop-simulator-prologue-review-next-chapter-please-pc/
- S40. Tap Tap Fish AbyssRium, Google Play. https://play.google.com/store/apps/details?id=com.idleif.abyssrium
- S41. Fishdom, Apple App Store. https://apps.apple.com/us/app/fishdom/id664575829
- S42. Viridi, Wikipedia. https://en.wikipedia.org/wiki/Viridi
- S43. Incremental game, Wikipedia. https://en.wikipedia.org/wiki/Incremental_game
- S44. "GDC 2012: Sid Meier on how to see games as sets of interesting decisions", Game Developer. https://www.gamedeveloper.com/design/gdc-2012-sid-meier-on-how-to-see-games-as-sets-of-interesting-decisions
- S45. "Loops and Arcs", Daniel Cook, Lostgarden. https://lostgarden.com/2012/04/30/loops-and-arcs/
- S46. "The Gamer's Brain, Part 2: UX of Onboarding and Player Engagement", Celia Hodent. https://celiahodent.com/gamers-brain-ux-onboarding/
- S47. "Creating compelling and continuous gameplay in a cozy farming/life sim adventure", Game Developer. https://www.gamedeveloper.com/design/creating-compelling-and-continuous-gameplay-in-a-cozy-farming-life-sim-adventure
- S48. "Currencies in game economy loops", Game Developer. https://www.gamedeveloper.com/business/currencies-in-game-economy-loops
- S49. Understanding SC 2.5.5 Target Size (Enhanced), W3C WAI. https://w3.org/WAI/WCAG22/Understanding/target-size-enhanced.html
- S50. Touch target size, Android Accessibility Help. https://support.google.com/accessibility/android/answer/7101858?hl=en
- S51. "The Thumb Zone: Designing for Mobile Users", Smashing Magazine. https://www.smashingmagazine.com/2016/09/the-thumb-zone-designing-for-mobile-users/
- S52. "Touch Control Design: Ways of Playing on Mobile", Mobile Free To Play. https://mobilefreetoplay.com/control-mechanics/
- S53. "How portrait mode trumped tablet-first gaming", PocketGamer.biz. https://www.pocketgamer.biz/comment-and-opinion/62882/how-portrait-mode-trumped-tablet-first-gaming/
- S54. GameAnalytics mobile gaming benchmarks 2025, GameDev Reports. https://gamedevreports.substack.com/p/gameanalytics-mobile-gaming-benchmarks

Not verified by the research pass: Apple's 44 pt guidance (page not fetched), Stardew's own sprinkler wiki page (a secondary guide was used), Planet Zoo's first-party animal guide, whether Megaquarium shipped its promised training UI change, and whether Supermarket Simulator restockers now collect deliveries.
