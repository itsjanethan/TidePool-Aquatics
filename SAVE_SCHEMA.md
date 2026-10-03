# Save Schema

## Format

A save is a JSON `SaveFile` (`src/sim/save.ts`):

```
{
  format: "tidepool-save",
  version: <SAVE_VERSION>,
  savedAt: <epoch ms>,
  summary: { slot, savedAt, shopName, playerName, dateLabel, money, version },
  state: GameState
}
```

`GameState` is defined in `src/sim/types.ts` and saved verbatim, except:

- `customers` is emptied (people inside the shop leave on reload).
- `fish[*].reservedBy` is cleared.
- `tanks[*].viewActive` is false.

## Storage

- Primary: IndexedDB database `tidepool-aquatics`, object store `saves`, keys `save:auto`, `save:slot1..3`.
- Fallback: `localStorage` keys `tidepool:save:*`, then in-memory (session only).
- Export/import: the same JSON as a downloadable file, or as copyable text in hosts that block downloads (office PC and title screen).
- Manual saves: office PC only (three slots). `lastSave {slot, minute, at}` records the most recent save for the "Last saved" text.
- Autosave: every opening time (09:00), after the overnight update and daily report, in slot `auto`.
- Service worker updates never touch IndexedDB, so saves survive new deploys.

## GameState top-level fields (version 3)

| Field | Notes |
| --- | --- |
| `version`, `seed`, `rngState`, `nextId` | Versioning, deterministic RNG, ID counter (IDs are prefix + base36) |
| `playerName`, `shopName`, `createdAt` | |
| `minute` | In-game minutes since day 1 00:00 (float) |
| `money`, `foodUnits`, `dryGoods{id: qty}`, `prices{speciesId: £}` | |
| `fish{id: FishEntity}` | Living fish, corpses still in tanks, and sold ancestors with descendants (`tankId: null`) |
| `tanks{id: TankState}`, `tankOrder[]` | |
| `profiles{id: CustomerProfile}` | Returning customers, capped at 80 |
| `suppliers{id: SupplierState}`, `orders[]` | |
| `reputation{dimension: 0..100}` | |
| `ledger[]`, `today` | Last 60 days of accounts |
| `log[]` | Last 80 messages |
| `player` | Position, facing, floor (a floor id from `src/data/floors.ts`: `ground`, `upstairs`, `marine`, `basement`) |
| `unlocks` | `floors[]` built floors (always includes `ground`), `marine`, `species[]`, `equipment[]` |
| `shopLevel` (v3) | 1..4; raised by buying expansions |
| `staff[]` (v3) | StaffEntity, see below |
| `applicants` (v3) | `{ day, list: StaffApplicant[] }` people who applied (refreshed every 3 days) |
| `proposals[]` (v3) | StaffProposal: staff suggestions awaiting a decision, capped at 40 |
| `retail{itemId: qty}` (v3) | Basement equipment stock (ids from `src/data/retail.ts`) |
| `objectives{id: {done, doneDay, progress}}` | |
| `stats`, `settings`, `flags` | `flags.devUsed` marks saves touched by the dev panel; `stats.plantsSold`, `stats.fryEaten` optional |
| `storage` (v2) | `{ decor{defId: count}, plants: PottedPlant[] }` stockroom; potted plants carry `uid, defId, size, health, origin` |
| `strains?` | `{id: Strain}` named lines: `id, name, speciesId, morphId, foundedDay, bestGeneration` |
| `demand?` | `{speciesId: 0.5..1}` sales saturation; missing means 1 |
| `lastSave?` | Most recent save of this game |

`idle` (Idle Mode) is runtime only: `serialize` deletes it, so a loaded game always resumes normal play.

### StaffEntity (v3)

`id, name, appearance (palette seed), personality, wage (£/day), experience, floor, x, y, path[], pending?, facing, walkPhase, role (sales | maintenance | stock | floater), assignedFloor? (null = anywhere), task?, skills{cleaning, service, speed, knowledge 0..100}, hiredDay, dialogue?, dialogueUntil, stats{tasksDone, customersHelped, proposals, sales}`

Saves keep who and where; `task`, `path`, `pending` and `dialogue` are cleared on save and load so staff simply resume their routine.

### StaffProposal (v3)

`id, staffId, kind (stock | aquascape), createdMinute, status (pending | approved | declined | snoozed), snoozeUntil?, delivered, title, reason, warnings[], stock?{speciesId, quantity, supplierId, tankId, unitCost}, aquascape?{tankId, defId, x, layer, cost, fixes}`

### CustomerState additions (v3, never saved)

Customers are not saved (they leave on load), but carry `floor`, `pending` (stairs leg), `wants[]`, `equipment[]`, `askedAdvice` and `helpedBy` at runtime.

### FishEntity

`id, speciesId, morphId, sex, ageDays, sizeCm, adultSizeCm, health, hunger, stress, shock, genes{loci, quality, size}, quality, temperament, disease, breedingReadiness, pregnancy, generation, parents{motherId, fatherId}, origin, originDetail, purchaseCost, tankId, tankHistory[], offspringCount, bornDay, alive, deathDay, deathCause, reservedBy, name, strainName`

`genes.loci` maps locus id to an allele pair (see `src/data/genetics.ts`); `morphId` is derived from it for species with genetics. `pregnancy` is `{daysRemaining, fryCount, fatherId?}` or null. `strainName` holds a strain id (key into `strains`). `parents` and `generation` give lineage; sold fish with offspring are kept with `tankId: null`.

### TankState

`id, name, sizeId, litres, lengthCm, water{temperature, ph, gh, ammonia, nitrite, nitrate, oxygen, aob, nob, detritus, cloudiness, salinity? (marine, ppt)}, skimmer? (marine), filterId, filterCondition, heaterId, heaterSetpoint, heaterBroken, airStone, lightOn, substrateId, backgroundId, ownedSubstrates[], ownedBackgrounds[], decor[{uid, defId, x, layer, flip, health, size}], broods?[{id, speciesId, motherId, fatherId, count, daysLeft, laidDay}], forSale? (false = customers cannot buy), waterType? (absent = freshwater), algae, glassDirt, food, lastFedMinute, viewActive, lastMaintenance{}`

`floating?` maps floating-plant id to surface coverage (0..1, total at most 1). `storage.floating?` maps floating-plant id to stored portions. Both optional within v2.

`decor[].size` is plant growth (1 = normal, up to the plant's `maxSize`; hardscape stays 1).

## Rules for changing the schema

1. Prefer additive, optional-safe changes.
2. Any change that old saves cannot satisfy: bump `SAVE_VERSION` in `src/sim/newGame.ts` and add `MIGRATIONS[oldVersion]` in `src/sim/save.ts` that upgrades a raw state by one version. Never edit an existing migration.
3. Add a test in `tests/save.test.ts` that migrates a hand-written old-version object.
4. Update this file and note the change in `DECISIONS.md`.
5. Saves from a newer version than the game are rejected with a clear message rather than corrupted.

Content IDs (species, morphs, decor, filters, suppliers) are stored in saves. Renaming or removing one requires a migration that maps old IDs.

## Version history

| Version | Change |
| --- | --- |
| 1 | Initial vertical slice |
| 2 | Plant `size`, `storage`, per-tank `ownedSubstrates`/`ownedBackgrounds`. Migration 1 sets size 1, empty storage and owns the current substrate/background. Optional fields added within v2 (`broods`, `strains`, `demand`, `forSale`, `lastSave`, new stats) are filled by `normalize()` on load. |
| 3 | v0.4.0. Floor registry ids (`floor1` becomes `ground`), `staff`, `applicants`, `proposals`, `shopLevel`, `retail`. Migration 2 maps the old floor id, keeps `ground` in `unlocks.floors` and fills empty staff, proposals, shop level 1 and empty retail stock. Tested in `tests/floors.test.ts` with a hand-made version 2 save. Expansion tanks (`U*`, `M*`, `Q*`) only exist once bought. |
