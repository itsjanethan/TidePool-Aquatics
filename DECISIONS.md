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
18. **Developer panel gating:** enabled in dev builds or with `?dev=1`. Any use sets `flags.devUsed`. A URL flag in production is acceptable because it is undiscoverable in normal play and useful for testers.
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
