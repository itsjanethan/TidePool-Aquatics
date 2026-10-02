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
