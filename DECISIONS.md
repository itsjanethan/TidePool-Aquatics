# Decisions

Append new entries at the bottom. Format: date, decision, reason. Revisit by adding a new entry, not by editing old ones.

## 2026-10-02: Vertical slice foundations

1. **Working title "Tidepool Aquatics".** Also the default shop name (player can rename the shop). A creative placeholder; the owner may rename the product.
2. **Currency is GBP (£).** The project owner is UK based. Prices are tuned to typical UK fish shop prices.
3. **Phaser 3.90 + Vite 8 + TypeScript 5.** Phaser 4 exists but the brief asked for Phaser 3; 3.90 is the final 3.x line. TypeScript 5 rather than 7 for tooling stability.
4. **All art is procedural for now.** No external assets keeps the build self-contained (single-file artifact, no licensing risk) and gives every species/morph art from data. See `ART_DIRECTION.md` for the stable texture keys hand art must keep.
5. **HTML/CSS for menus, Phaser for the world.** Menus are text heavy and need accessibility, wrapping and mouse support; DOM is better at this. Sizes are expressed in game pixels via `--px` so the UI scales with the canvas.
6. **Pure simulation layer.** `src/sim` has no Phaser or DOM imports so it can be unit tested and run headless (balance bot, future server-side validation).
7. **Customers are simulated on the grid, not by the renderer.** Their position matters for gameplay (queue order, approaching the player), and the sim can fast-forward them.
8. **Time scale: 2 game minutes per real second at 1x, shop open 09:00 to 18:00.** About 4.5 real minutes per trading day: long enough to do chores and serve, short enough to see days pass. 2x and 4x speeds available.
9. **Time pauses in blocking menus and dialogue, runs in the tank view.** Reading should never be punished; watching fish is part of the shop day.
10. **Player chores cost game time.** Water changes, cleaning and moving fish advance the clock, creating a trade-off with serving customers and setting up later staff delegation.
11. **Grid-locked player movement (tap to turn, hold to walk, Shift to run).** Matches the handheld RPG feel and is controller friendly.
12. **Nitrogen cycle uses bacteria maturity toward a bioload-dependent target.** "Cycled" means bacteria are established and ammonia/nitrite are near zero, not that bacteria are at maximum. This gives realistic mini-cycles when overstocking.
13. **Toxicity is thresholded.** Ammonia under ~0.1 ppm and nitrite under ~0.15 ppm cause stress but no damage, so beginners have time to react.
14. **Tank C2 starts uncycled and empty** as the teaching tank and an objective.
15. **Sold fish are deleted from the save** unless they have offspring (kept for lineage). Keeps saves small over long games.
16. **Customers inside the shop are not saved.** Reloading empties the shop; reserved fish are released. Simpler and avoids half-finished transactions.
17. **Autosave at 09:00 each day** (after the overnight simulation and daily report) in slot `auto`, plus three manual slots and JSON export/import.
18. **Developer panel gating:** enabled in dev builds or with `?dev=1`. Any use sets `flags.devUsed`. A URL flag in production is acceptable because it is undiscoverable in normal play and useful for testers. (Superseded 2026-10-03: developer tools are build-time only, see below.)
19. **Behind-the-counter tiles are staff only** for customers, so they do not crowd the till side.
20. **Reputation gains have strong diminishing returns** (`1.2 x (1 - r/100)^2`). Early stars come quickly, the top end is slow, leaving room for long-term progression.
21. **Overworld tanks hide fish beyond 14 dots.** Purely visual cap.
22. **Advice choices show section and adult size.** Gives beginners a fair chance to reason (tank size, heater) without revealing the answer.
23. **The 'beautiful tank' goal requires a layout score of 70** because the starter B1 already scores about 61.

## 2026-10-03: Milestone 1.5

24. **Font switched to Jersey 10 (body) and Tiny5 (logo), bundled via @fontsource.** Pixelify Sans drew "2" and "5" so they read as mirrored. Fixed at the source, not with per-character hacks. Bundling also removes the only runtime network dependency (Google Fonts).
25. **Canvas doubled to 960x640 (`RES = 2`).** The shop keeps its 480x320 pixel art via camera zoom; the tank view uses the extra resolution for smoother fish and plants. UI stays in logical pixels.
26. **Menus take the mouse only on real pointer movement.** Rows re-rendering under a resting cursor caused the selection jumps players saw with arrow keys.
27. **Disabled menu rows stay selectable.** Their hint explains why they are unavailable; activation is refused.
28. **Ownership is per tank for substrate and background, shop-wide for decor and plants.** Swapping back to an owned substrate is free; removed decor goes to the stockroom (`storage.decor` counts, `storage.plants` potted plants) and can be placed in any tank.
29. **Plants grow continuously (`DecorItem.size`).** Cuttings take a fixed fraction (small 0.2, medium 0.35, large 0.55) and never leave the parent below 0.35. Bigger cuttings are worth more but set the parent back further. Plants above 1.3 are overgrown and shade the tank.
30. **Player-grown plants sell at shop prices with no wholesale cost.** That is the economic advantage of growing your own; the trade buyer pays 50% for bulk surplus.
31. **Breeding is method data, not species code.** Methods: livebearer, egg_scatterer, adhesive_eggs, cave_spawner, with clutch, incubation, egg predation, parental care, optional trigger (water change, spring) and needs (plants, cave, soft water).
32. **Population caps:** 70 fish per tank, 24 surviving fry per egg brood. Prevents runaway populations and keeps performance stable.
33. **Genetics are simple Mendelian loci with dominance ranks plus polygenic quality and size.** Quality and size regress 10% toward the mean each generation, so selective breeding pays off gradually without runaway values. Mutation 0.4% per allele.
34. **Hidden carrier alleles are only shown for fish whose genotype the player could know:** shop-bred fish and fish that have had offspring. Supplier fish show only their look.
35. **Strains need F2+, both parents shop-bred and showing the same look.** Strain value bonus is +8% per generation, capped at +40%; shop-bred adds 10%.
36. **"Customers can buy" flag per tank.** Breeding and grow-out tanks are inferred from this flag and contents rather than an explicit role system.
37. **Species demand saturates when you sell a lot of one species** (-0.6% per fish, floor 50%) and recovers daily. Stops one cheap bred species flooding the economy.
38. **Daily rent lowered to £25** after long-run tests showed shops stagnating.
39. **Order warnings never block.** Uncycled tanks, overstocking, temperature, pH, hardness, water type, compatibility and group size are reported per line and summarised before placing the order.
40. **The office PC is the save hub.** Saving is only possible there (the pause menu points to it); load, export and import are there too. Autosave runs each morning at opening (09:00, after the overnight update) and is announced by a small HUD indicator rather than a toast.
41. **Service worker cache name is stamped per build** and old caches are deleted on activate, so deploys can never serve a stale mix of files.
42. **Customer profiles capped at 80** (oldest without grievances pruned) and archived ledger notes trimmed. A year-long save dropped from about 1 MB to under 200 KB.

## 2026-10-03: Habitat visual fidelity (v0.3.0)

43. **Procedural phenotype painting with cached sheets** for fish (see ARCHITECTURE.md, Fish rendering architecture). Layered sprites were too costly per fish; palette swaps cannot change silhouettes.
44. **Phenotype is a pure sim module.** Tests can assert that genes change looks, and the same description drives tank sprites, portraits and the gallery.
45. **Allele data carries visuals** (`visual`, `value`, `label`, `freq`). New loci list the wild/common allele first so saves made before a locus existed default to it. Supplier genotypes draw alleles by `freq` (albino around 1 in 900).
46. **Male-only loci** for guppy and endler tail and dorsal traits: females and juveniles carry them hidden. **Additive loci** (metallic) show half strength with one copy.
47. **Trait value is capped at x2.5** combined, on top of morph, quality, strain and size factors.
48. **Turn frames**: three yaw frames, flip at the midpoint, minimum width = body thickness so a head-on fish is an oval not a sliver.
49. **Fish sheets are painted under a 10 ms per-frame budget**; fish appear once painted. Up to 160 sheets cached, least-recently-used evicted after 20 s unused.
50. **Floating plants are coverage, not items.** Columns ranked by smooth noise give patchy growth that spreads; one portion is 5% of a 60 cm surface. Duckweed grows fastest (about 0.6 per day logistic) so it becomes a chore if ignored, as in real tanks.
51. **Shade affects the sim and the picture from the same number**: floating shade slows rooted plants (up to 80%) and algae (up to 60%) and darkens the light map.
52. **Planted soil** gives rooted plants a 1.35x growth multiplier. New substrates: fine gravel, river pebbles, planted soil.
53. **Starter tanks were redecorated** (new games only) to show the range of looks; the "beautiful tank" goal moved from layout 70 to 85 because two starter tanks now score in the 70s.
54. **Quality settings never reduce fish detail.** They trade particles, caustics, shadows and plant animation rate.
55. **Z in the tank view opens the selected fish's details** (tank menu when nothing is selected).

## 2026-10-03: Diagnostics, help, staff, Idle Mode, floors, expansions (v0.4.0)

- **One diagnostics module.** `sim/tankDiagnostics.ts` turns the existing simulation (stress causes, aquascape summary, water, stocking, hunger, health, cleanliness, filter, habitat, breeding) into structured issues. The tank menu, the overworld icons, the tank view status line and maintenance staff all read it, so they cannot disagree. A sick fish is reported as sick with its real causes; "toxic" is only used when the water itself is harmful.
- **Previews run the real action on a clone.** `previewFix` deep-copies the state, runs the same sim function the button runs and diffs player-facing metrics. A test asserts preview equals the real result for every fix. Cost: one `structuredClone` per previewed action, only when a menu that shows previews is open.
- **Habitat in numbers.** Cover is `min(100, cover*160)` percent of what the tank offers; each species states its cover, cave, open-space, sand and wood needs (`SpeciesDef.habitat`), and the strictest species in a tank sets the target. Caves have `caveSlots` (slate stack and limestone hold two), and adult cave dwellers each need one.
- **Help is data.** `data/glossary.ts` holds every definition once; menus link to entries by id (`helpLink` for mouse, `helpItem` rows for keyboard and gamepad). H, F1, gamepad LT or right-stick click, and the HUD ? button open Help. Icons in the glossary are the real overworld textures.
- **Idle Mode is not saved.** It is a runtime flag (`state.idle`) stripped by `serialize`; loading always resumes normal play. Rationale: a save should never silently start paused, and "business paused" must be a choice made in the current session. Enforcement is at the sim level (`advance`, `skipToNextMorning`, `spend`, `earn` and every action that changes the business return "Unavailable in Idle Mode."), with UI locks on top that keep rows visible with the reason. Renderers keep animating; fish only mime eating; staff and customers stand where they are and look around. Future hook: an optional "Live Simulation" variant would set a different flag that allows `advance` but keeps the transaction guards; the guards are already separate from time.
- **Floors are data.** `data/floors.ts` registers ground, upstairs (L2), marine (L3) and basement (L4) layouts with stairs props that name their target floor. Only the player's floor is rendered (the Shop scene restarts on a stairs change); customers and staff carry a floor and walk via stairs on any built floor (`sim/walker.ts`), so off-screen floors keep simulating.
- **Save version 3** with migration from v2 (v0.3.0 saves load).
- **Staff never spend money on their own.** Stock and aquascape ideas are proposals that need approval (Approve / Review / Not now). Proposals come from real supplier stock, demand and tank suitability; knowledge decides how sensible they are (a less knowledgeable stock clerk may pick a poorer tank, and the warnings say so). Proposals expire after two days and are withdrawn if the supplier sells out. Aquascape proposals show the effect predicted by running `addDecor` on a cloned state.
- **Staff skills grow slowly** (`practise`: 0.05 points per unit of practice, scaled by personality and diminishing near the cap). Personalities are trade-offs, never strictly better.
- **Wages and rent.** Wages are `12 + average skill * 0.3` per day times a personality factor (about £25 for an average hire). Each expansion adds rent (£12, £20, £15). Customer arrivals and the in-shop cap scale with shop level (+35% arrivals and +3 customers per level), so a bigger shop needs and can pay for staff.
- **Marine v1.** Salinity is simulated in ppt and shown as SG like a hydrometer. Evaporation raises it about 0.22 ppt a day; RO top-off restores it; marine water changes use salt mix (without it salinity drops). Freshwater and marine are enforced: orders and moves into the wrong water type are refused, live rock cannot go in freshwater, plants and wood cannot go in marine tanks.
- **Retail.** Equipment stock lives in `state.retail` with stock space (40 without the basement, 240 with it). Equipment customers walk to the basement racks, prefer a bundle when it is cheaper than its contents, and pay at the till like everyone else.
- **Deployment.** GitHub Pages via Actions. The base path is `./` by default (zip, file://, single-file artifact, any subfolder) and `BASE_PATH=/<repo>/` on Pages. Service worker caches are named per scope so two copies of the game on one origin never delete each other's caches. Verified with `scripts/nested-test.mjs`.
- **No telemetry.** "Copy Playtest Report" builds text locally and copies it; nothing is sent anywhere.

## 2026-10-03: Deployment maintenance

- **30-day simulation timeout: 30 seconds.** Pages run 37124004146 took 5.154 seconds and exceeded the default five-second limit. Keep all simulated days, seeds and assertions; give only this test finite CI headroom.
- **Validate pull requests before deployment.** Repository checks runs the full check/build using Node 22 and the Pages base path. Publishing remains restricted to the existing main/manual Pages workflow. Maintainer and release practices are in MAINTAINING.md.

## 2026-10-04: Aquascape explanations come from the real scoring

- **No second set of numbers.** `summarizeAquascape` now returns its layout components (substrate, background, variety, number of items, fullness, spread, depth, item looks) with their maxima; the score is still their sum. Previews run the real placement (`addDecor`, `plantFromStorage`, `placeDecorFromStorage`, or the move) on a copy of the game and score it with the same function, so an explanation can never disagree with the result. Tested for every decor item at several positions.
- **Score and fish care are separate.** "Score" lines are the layout score customers and reputation react to. "Fish care" lines compare cover, caves, wood, sand and open water against what the fish in that tank need (`tankNeeds`), and say when nothing changes. Trade-offs (open water lost, shade) are listed on their own.
- **Short while browsing, full while placing.** The list shows score before and after, what the item gives, the biggest score changes and one care line; placement adds limits and every care line and updates as the item moves or changes depth. Landscape phones get the short version so the buttons stay on screen.
- **On-screen placement buttons** (◀ ▶ ▲ Back ▼ Front Place Cancel): touch screens have no d-pad in the immersive tank view, so placing was impossible on phones before.
- In portrait the floating B no longer appears over the tank view (it covered sheet text); the screens there have their own Back, Cancel and Done.

## 2026-10-04: Rapid taps never zoom the page

- **Two layers.** CSS `touch-action` (`none` on the controls, `manipulation` on buttons and rows, `pan-y` on lists; per the spec double-tap zoom needs `auto`) plus touch-event guards, because iOS Safari has honoured `touch-action` inconsistently.
- **The controls cancel every touch event** (no double-tap zoom, pinch, callout, scrolling or ghost clicks). Pointer events already drive them, so a click could only duplicate an action.
- **Everywhere else on the page, only a quick second tap is cancelled** (within 500 ms, longer than browsers' double-tap window) and its click is delivered by hand, so rapid taps on menu rows, arrows and HUD buttons each still count once. Single taps, swipes in lists and text fields keep native behaviour. The guard covers the whole page, because near misses beside a button land on the page background.
- **Pinch zoom is kept** where the browser supports `touch-action: pinch-zoom` (menus, lists, page); the viewport meta still allows zoom. Double-tap zoom is off inside the game page.
- Rotation now releases held buttons too, and the menu button works during a tap-to-move walk (it used to be ignored until the walk ended).

## 2026-10-03: Not for sale (individual fish)

- **Enforced in the simulation, not the menus.** `sellable()` excludes protected fish (covers browsing, advice sales and stock lists), `completeSale()` keeps any protected fish that reaches a basket and takes its price off the total (covers the player and sales staff at the till), and `sellFishToTrade()` skips them. There is no other automatic selling.
- **Protecting releases reservations.** The fish comes out of the customer's basket with a short "not for sale?" thought and a small satisfaction dip; a customer at the till with nothing left walks out without counting as a lost customer.
- **Removing protection always asks.** Single fish and bulk both confirm, and the toast says what changed. Nothing else clears the flag.
- **An optional field, no save version bump.** `notForSale` is absent on older saves (unprotected), survives moves, saves and export/import, and is never copied to fry. Allowed in Idle Mode, since it is not a transaction.
- Tank-level "Customers can buy" stays as it was; the two combine (a fish is buyable only if both allow it).

## 2026-10-03: Aquarium visuals pass

- **Every new effect reads the simulation; none is decoration for its own sake.** Mulm on the bed follows detritus (a gravel vac clears it). Surface film needs detritus and a still surface (filter flow, air stone). Oxygen pearls come only from healthy plants (health above 0.6) under light, fewer when there is no nitrate. Hardscape darkens under floating cover and canopies (the light map) and greens with the tank's algae. Lights ramp over about a second when the tank's light switches. Fish near the top mirror on the underside of the surface (High only). The formulas live in `render/stateVisuals.ts` and are unit tested.
- **Pay for the effects first.** Profiling showed plant redraws (procedural Graphics every frame) were most of the update time in planted and capped tanks. Plants now redraw every 2 frames at Standard and every 3 at Low, in staggered buckets so the work is even across frames. At Standard that more than pays for the new effects.
- **Auto quality is the new default and only steps down.** It starts at Standard, ignores the first 2.5 seconds of a tank view (texture painting), and after a 3-second window with a median frame over 34 ms drops one level for the session. It never steps up by itself, to avoid oscillation; choosing a level turns it off. Fish detail is never a quality knob.
- **Reduced motion is a device setting** (Follow device / Reduced / Full). Reduced: calmer surface and caustics, no ray sway, slower and smaller plant and root sway, no CSS animations, the store camera cuts instead of gliding. Fish behaviour is content and stays the same.
- **Per-tank generated textures are bounded.** Substrate beds and mulm keep the 6 most recent tanks (the current one is never evicted); fish sheets already had an LRU of 160. Visiting every tank no longer keeps every bed in memory.
- **No photorealism claims.** This is a pixel-art game; the goal is a tank that reads its own state at a glance.

## 2026-10-03: Mobile layout

- **The game fills the screen; cameras decide what to show.** The fixed 3:2 stage scaled to fit made phones show a small strip of game with tiny text. The canvas now fills the game rectangle and each scene fits its camera: the store follows the player up close, the tank view fits the tank, the title tank covers the screen. Resolution-independent UI was the bigger win than any single CSS tweak.
- **UI size is separate from canvas size.** `--px` is now a UI unit with a floor (18 px body text, 16 px smallest) and a per-device text-size setting. Desktop at the original 960x640 keeps the old scale.
- **Controls get their own space on phones.** Portrait: a band below the game. Landscape: columns either side. The game is never covered by the d-pad. Screens too small to reserve space fall back to translucent overlay controls. The tank view on touch devices is immersive because it already has its own buttons.
- **Store camera closeness: 2.25 CSS px per world pixel target on touch, rounded to whole canvas pixels** (2.5 at DPR 2). About 10 tiles across in portrait. Map view shows the whole floor. Desktop at 960x640 is unchanged (whole floor).
- **Tap to move is on by default for touch and pen, never for mouse**, uses the same walk grid and step logic as the d-pad, and is cancelled by any direction input. It is a per-device setting.
- **Device settings live in localStorage, not the save.** Text size, font, camera and tap to move describe the screen, not the shop; they carry across saves and new games.
- **Store detail is painted into the floor layer only** (queue markings, staff-only hatching, contact shadows, drains, notice board). The walk grid comes from tiles and props, so paths and saves are unaffected.

## 2026-10-03: Hold B to run

- **B runs only while walking the store.** Holding B (on-screen, gamepad B, keyboard X) or the existing Shift / gamepad X doubles the player's pace: one tile per 0.085 s instead of 0.17 s. The press still reaches menus first, so B remains Back and Cancel everywhere else; in the overworld a `back` press had no meaning, so nothing is lost. Running changes only the player's step time, never the simulation clock, and movement stays one grid tile at a time (no diagonals).
- **Held input never sticks.** Blur, pagehide and a hidden tab clear every held source. Touch uses pointer capture per finger so slight thumb drift does not drop a run, and every end path (up, cancel, lost capture, a lift elsewhere) releases.
- **The hint lives in the prompt line.** "Hold B to run" ("Hold Shift or X to run" on a keyboard) appears when nothing is in front of the player, until they first run on that device. Stored in localStorage as a convenience, not in the save.

## 2026-10-03: Developer Sandbox and build separation

- **Developer tools are a build-time switch.** `__DEV_TOOLS__` is `true` only in Vite `development` and `sandbox` modes. Everything developer-only lives in `src/dev/` and is reached only through `if (__DEV_TOOLS__)` dynamic imports, so the production build drops it. The old `?dev=1` / `#dev` URL flags and the unconditional `window.__tidepool` hook are gone. `scripts/verify-public-build.mjs` is part of `npm run check`.
- **The sandbox is a fixture, not a cheat mode.** `createSandbox()` builds the game with the real systems (expansions bought, staff hired, decor placed with `addDecor`, fish created with `createFish`), so validation rules still apply; presets refuse the wrong water type. Deterministic seed 4242.
- **Separate save namespace.** Sandbox games carry `flags.sandbox` and are saved under the `sandbox:` key prefix (`PrefixedStorage`). Each `SaveManager` refuses games from the other namespace and hides them from its list, so Continue can never load a sandbox. Importing a sandbox file into normal play shows a warning and permanently sets `devUsed`.
- **No hosted developer build.** The repository is public, so source visibility cannot be controlled; what matters is that the hosted public game contains no developer tools. `dist-sandbox/` is git-ignored and never deployed. Remote developer access, if ever needed, must use hosting with server-enforced authentication, not a secret URL or client-side password.
