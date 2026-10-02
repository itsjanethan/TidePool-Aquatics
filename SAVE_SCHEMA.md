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
- Export/import: the same JSON as a downloadable file (pause menu and title screen).
- Autosave: every opening time (09:00), after the daily report.

## GameState top-level fields (version 1)

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
| `player` | Position, facing, floor |
| `unlocks` | floors, marine, species, equipment |
| `objectives{id: {done, doneDay, progress}}` | |
| `stats`, `settings`, `flags` | `flags.devUsed` marks saves touched by the dev panel |

### FishEntity

`id, speciesId, morphId, sex, ageDays, sizeCm, adultSizeCm, health, hunger, stress, shock, genes{loci, quality, size}, quality, temperament, disease, breedingReadiness, pregnancy, generation, parents{motherId, fatherId}, origin, originDetail, purchaseCost, tankId, tankHistory[], offspringCount, bornDay, alive, deathDay, deathCause, reservedBy, name, strainName`

`genes.loci` is reserved for the Milestone 2 genetics system (locus -> allele pair). `pregnancy` is reserved for breeding.

### TankState

`id, name, sizeId, litres, lengthCm, water{temperature, ph, gh, ammonia, nitrite, nitrate, oxygen, aob, nob, detritus, cloudiness}, filterId, filterCondition, heaterId, heaterSetpoint, heaterBroken, airStone, lightOn, substrateId, backgroundId, decor[{uid, defId, x, layer, flip, health}], algae, glassDirt, food, lastFedMinute, viewActive, lastMaintenance{}`

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
