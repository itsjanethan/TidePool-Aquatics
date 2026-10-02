# Species Schema

Defined in `src/data/speciesTypes.ts`; data in `src/data/species.ts`. Gameplay must only read these fields and tags, never branch on `id`.

## Identity

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string | Stable, snake_case. Saved in fish records: never rename without a migration. |
| `commonName`, `scientificName`, `family` | string | Display |
| `waterType` | freshwater, brackish, marine | |
| `section` | coldwater, temperate, tropical, marine, reef | Shop area and advice wording |
| `nativeRegion` | string | Flavour |
| `rarity` | common, uncommon, rare, very_rare | Supplier availability (future) |
| `difficulty` | 1 to 5 | Guidance for customers and unlocks |
| `starter` | boolean | Sold by the starter supplier |
| `description`, `careTip` | string | Shown in fish cards and advice replies |

## Requirements

| Field | Type | Notes |
| --- | --- | --- |
| `temperature` | `{min, max, ideal}` °C | Outside range damages health; distance from ideal adds stress |
| `ph` | `{min, max, ideal}` | |
| `hardness` | `{min, max}` dGH | Mollies need hard water, neons soft |
| `minTankLitres` | number | Smaller tanks stress and stunt |
| `minTankLengthCm` | number | Dimensions matter as well as volume |
| `social` | solitary, pairs, group, shoal | |
| `minGroupSize` | number | Below this, group-living fish are stressed |
| `swimLevel` | top, middle, bottom, all | Also used by overworld mini fish |
| `sensitivity` | 0..1 | Multiplies damage from bad water |

## Biology

| Field | Type | Notes |
| --- | --- | --- |
| `adultSizeCm` | number | Average across sexes |
| `femaleSizeMultiplier` | number | Relative female size (livebearer females are bigger) |
| `birthSizeCm` | number | |
| `growthRate` | per in-game day | Logistic toward individual adult size |
| `lifespanDays`, `maturityDays` | in-game days | 112 days per year |
| `aggression` | 0..1 | Harassment of other species scales with size ratio |
| `territorial` | boolean | With tag `territorial_bottom`, rivals need caves |
| `diet` | omnivore, herbivore, carnivore | |
| `wasteFactor` | number | Ammonia per cm². Goldfish ~2.2, neons ~0.8 |
| `plantSafe` | boolean | False = damages soft plants |
| `breeding` | `{method, difficulty, notes}` | Methods: livebearer, egg_scatterer, adhesive_eggs, cave_spawner, substrate_spawner, mouthbrooder, bubble_nest, pair_former |

## Economy

| Field | Notes |
| --- | --- |
| `supplierCost` | Typical wholesale (£) |
| `retailPrice` | Suggested retail for an average adult (£) |

## Tags

Free-form strings used by rules in `sim/compat.ts` and `ui/screens/aquascape.ts`:

- `long_finned`: males targeted by fin nippers
- `livebearer`: smaller female tails in art, courtship behaviour
- `needs_cave`, `needs_wood`, `needs_sand`: habitat stress if missing
- `territorial_bottom`: bottom territory disputes
- `eats_tiny_fish`: harasses fish under 30% of its length
- `coldwater`, `temperate`, `hard_water`, `soft_water`, `shoaling`, `small`, `peaceful`, `fast`, `messy`, `slow`, `nano_safe`, `brackish_tolerant`, `bottom`: descriptive, available for future rules

## Visuals

| Field | Notes |
| --- | --- |
| `body.shape` | slender, torpedo, deep, livebearer, catfish, pleco, goldfish |
| `body.fins` | short, fan, delta, long, sail, twin |
| `body.heightRatio` | Body height relative to body length |
| `morphs[]` | `{id, name, body, belly, fin, accent, pattern, weight, priceMultiplier, female?, finStyleOverride?}` |

Patterns: none, neon, stripes, spots, mosaic, bars, tailspot, calico, speckle. `weight` is the relative chance a supplier fish has that morph.

## Behaviour (tank view)

`behaviour`: `speed` (body lengths per second), `schooling` 0..1, `shyness` 0..1, `restlessness` 0..1, `depth` [top, bottom] as fractions of the water column, and flags `bottomRester`, `grazer`, `sifter`, `airGulper`, `nocturnal`, `finNipper`, plus `chaseTendency` 0..1.

Grazers also reduce algae in the background simulation.

## Checklist for a new species

1. All ranges valid (`min < ideal < max`), `retailPrice > supplierCost`. The unit test enforces this.
2. At least one morph with sensible colours; check it in the tank view (dev panel: spawn species).
3. Tags for any special needs.
4. Add to a supplier.
5. Add a line to `GAME_DESIGN.md` if it introduces a new mechanic.
