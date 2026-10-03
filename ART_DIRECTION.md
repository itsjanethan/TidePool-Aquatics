# Art Direction

## Two visual identities

- **Shop world:** charming, readable, deliberately retro. Late-era handheld RPG interiors: clean top-down tiles, small expressive characters, dense but readable rooms, chunky dialogue boxes.
- **Habitat view (the tank):** detailed, alive, visually rich pixel simulation. Not limited by handheld hardware: higher sprite resolution, more frames, more colour, layered depth, nuanced light. Stepping into a tank should feel like a reward, and players should want to stop and watch.

Everything is original. Never copy assets, characters, maps, music, sprites or code from existing games. Photo references are quality targets, never assets to trace.

## Technical frame

- Logical resolution 480 x 320 (3:2); canvas 960 x 640 (`RES = 2`). The shop is drawn at 480 x 320 with camera zoom 2. The tank view draws natively at 960 x 640. Nearest-neighbour filtering (`pixelArt: true`).
- Tiles 16 x 16. Characters 16 x 16 frames, four directions, three frames each.
- UI: Jersey 10 (body) and Tiny5 (logo), bundled, sized in logical pixels via `--px`. Any replacement font must draw digits unambiguously and include ★ ☆ ♂ ♀ ◀ ▶ ▲ ▼ ⚠.

## Photo reference analysis (October 2026)

What makes the reference aquariums convincing, what is practical here, and the rule we took from it:

| Reference | Convincing because | Practical in our style | Rendering principle |
| --- | --- | --- | --- |
| Sword plants on mossy driftwood, sand, orange fish | Dense mid-height broad leaves lit from above; moss softening wood; flat sand foreground; open water above | Yes | Plants lit by height (tops brighter); leaves are shapes with midribs, not sticks; leave open swimming space |
| Dense stem-plant tank with rainbowfish | Many textures side by side (fine stems, round bushes, red tips); fish read against green | Partly | Each plant species has its own architecture and colour; red stem tips under strong light |
| Gravel, rounded stones, spider wood, dark background | Dark background makes plants and fish pop; stones of varied size and tone; gravel of mixed colours | Yes | Dark backgrounds available; stones irregular and varied; gravel mixed grain colours |
| Reef tank (marine, later) | Saturated corals, blue light, dense rockwork | Later | Light colour is data (`waterLook.light`), never hard-coded |
| Fish close-ups (paradise fish, medaka, ember, barb, rasbora) | Translucent fins with rays; metallic scale glints; iridescent stripes; eye rings | Yes | Fins are translucent membranes with darker rays; metallic scales glint in a moving band; eyes have iris, ring, highlight |
| Illustrated community tank | Floating mat with long dangling roots; colourful long-finned males vs plain females; spotted corys on gravel | Yes | Floating plants as surface mats with roots; sex differences visible; bottom dwellers on the substrate |

Depth cues we rely on: back plants and hardscape slightly darker and bluer; fish scale 0.8 to 1.0 with depth and dim with distance; fish pass behind middle and front decor; light falls off toward the bottom; shade under floating plants and canopies.

## Fish rendering pipeline

Fish are painted procedurally per individual. Never a single sprite per species, never whole-fish tinting for morphs.

1. **Phenotype** (`src/sim/phenotype.ts`, pure): species defaults, morph colours and `morph.visual`, female colours (fading in with maturity), expressed alleles (`AlleleDef.visual`), individual variation from the fish id (8 variants), heritable quality (saturation, fin size), life stage (fry translucent and plain, colours and fins develop with size), condition (gravid belly, egg-laden roundness, faded and clamped fins when ill).
2. **FishPainter** (`src/render/art/fishPainter.ts`, pure): paints a sheet from a phenotype at a display length. Layers back to front: far pectoral, caudal fin, dorsal, adipose, anal, body (countershading, rounded lighting, rim light, silvery belly), pattern layers, scales and metallic glints, markings (gravid spot, armour plates, wen), gill plate, eye, mouth and head features, near pectoral and pelvic fins, outline, light posterisation.
3. **Texture cache** (`src/render/art/fishArt.ts`): sheets keyed by a quantised phenotype key and length; look-alike fish share textures; LRU eviction (160); painting budget ~10 ms per frame so busy tanks fade in rather than stall.

### Sprite sheet conventions

- Fish face right. Origin centre. Sheet = 11 frames in a row: frames 0-7 swim cycle (tail beat phase 0..2π), frames 8-10 yaw toward the viewer (0.55, 0.95, 1.3 rad) used mid-turn before the sprite flips.
- Display length = size in cm x tank pixels per cm x 1.7. Lengths quantise (2 px under 40, 4 under 100, then 8) so growth repaints only a few times.
- Body length excludes the tail; tail length depends on tail shape and size (a delta male is longer than a female of the same body size).
- Texture key: `fish2:<length>:<hash of phenotype key>`.

### Anatomy vocabulary (data, `SpeciesDef.body`)

- `shape`: slender, torpedo, deep, livebearer, catfish, pleco, goldfish (outline profiles with peduncle, peak, snout, mouth position).
- `caudal`: fork, round, fan, delta, veil, sword, double_sword, lyre, twin, spade.
- `features`: adipose, barbels, scutes, sucker, bristles, upturned, lateral; gonopodium is added automatically for adult male livebearers.
- `iris`, `finClarity` (0 opaque .. 1 glass-clear).

### Pattern layers ("morph masks")

Patterns are procedural layers with a colour, region (body, fins, tail, all) and strength, stacked in order: neon, stripes, bars, spots, speckle, mosaic, cobra (snakeskin), tuxedo, wag (black fins via `finColour`), gradient, lateral, blotch, calico, tailspot. Placement varies with the fish's variant so siblings differ. To add a pattern: implement it in `bodyPattern` (and in `drawCaudal`/`drawDorsal` for fin regions), add it to `PatternType`, document it here.

### Visible genetics rules

- A different expressed allele should usually change the picture: colour, tail shape, fin size, dorsal, metallic sheen, albino (pale body, red eye), golden, telescope eyes, wen.
- Male-only loci (guppy tails, dorsals) are carried invisibly by females and juveniles.
- Additive loci (metallic) show half strength with one copy.

## Movement (data-driven)

`SpeciesDef.motion`: `beatHz`, `glide` (burst-and-coast vs steady paddling), `turnRate`, `inertia`, `hover`. Each individual varies speed, rhythm and glide by a few percent. Behaviours: cruise, school around a shared moving point (tightness from `schooling`), pause/hover with sculling, investigate decor, feed with lunges and short swallowing pauses, chase/flee, court (males display beside females), rest, hide (tucking behind decor), sift nose-down kicking up substrate puffs (corydoras), graze glass upright or decor (plecos), gulp air.

## Plants

`src/render/art/plantArt.ts`. Architectures by `DecorDef.art`:

| Art | Species | Structure | Growth changes |
| --- | --- | --- | --- |
| sword | Amazon Sword | Rosette of lanceolate leaves on stalks with midrib and veins; outer leaves old and arching | More and longer leaves; trails at the surface when overgrown |
| crypt | Cryptocoryne | Low rosette, wavy bronze/olive leaves | More leaves |
| fern / anubias | Java Fern, Anubias | Creeping rhizome with leaves rising along it; fern spores on old leaves | Longer rhizome, more leaves |
| vallis | Vallisneria | Ribbon clumps with twist highlights | Runners add daughter clumps beside the mother |
| hornwort / rotala | Hornwort, Rotala | Stems with needle whorls / leaf pairs; rotala tips blush pink | More stems, taller; trail along the surface |
| moss | Java Moss | Fuzzy clumps of short strands | More and bigger clumps |

Stages: cutting, juvenile, established, mature, overgrown (`plantStage`). Plants are toned by the light map; back-layer plants are slightly hazier. Poor health yellows older leaves first.

### Floating plants

`src/render/floatingLayer.ts`. Coverage per species (from the sim) maps to surface columns ranked by smooth noise, so mats grow from patches and spread to a carpet. Duckweed: piled rows of tiny fronds with short roots, thicker and darker when dense. Frogbit / red root floater: rosettes of round leaves seen from below with long (red) roots. A shade gradient falls below covered water and the light map darkens fish and plants under the mat.

## Hardscape, substrate, background

- Hardscape (`hardscapeArt.ts`): irregular noise silhouettes, sphere-ish shading from the top-left, grain, strata, pits and holes, bark lines, two-tone mopani, branching spider wood, dark crevices and cave mouths, contact shadows. Back-layer hardscape is tinted slightly darker and bluer.
- Substrate (`substrateArt.ts`): per-tank contoured bed (seeded by tank id) with a receding top surface band and a cross-section front; grain types sand, fine, gravel, coarse pebbles, planted soil, bare. Decor sits on the contour.
- Backgrounds: clear glass (wall seen through water), black, blue gradient, rock wall (out-of-focus stones). All have a depth gradient and a pool of light under the lamp.

## Light and water

- Light map (`lighting.ts`): falls off with depth; shaded by floating plants, plant canopies, wood and caves; blurred; sampled by fish (tint), plants (tone), shadows, rays and caustics.
- Water look: tint from tannins (wood) and green water (very high algae); light colour from the same function. Blackwater later is a data change (more tannin, leaf litter), not a new renderer.
- Neglect shows from state: algae film thickest low and in corners, glass dirt, cloudiness, particles that increase with detritus.

## Quality settings

Low / Standard / High (per browser) change particles, caustics, fish shadows, plant animation rate and root detail. Fish detail and morph visibility never change.

## Asset pipeline (for future hand-drawn art)

Procedural art is the default so every species, morph and growth stage has art from data. Hand-drawn assets may replace or augment generators later under these rules:

- Folder: `public/art/<category>/<id>/` (fish, plants, hardscape, substrate). No loose images elsewhere.
- Fish templates: layered PNGs per species at 4x reference length (e.g. a guppy body at 160 px): `body.png` (greyscale shading), `pattern-<name>.png` (alpha masks), `caudal-<shape>.png`, `dorsal.png`, `anal.png`, `pectoral.png`, `eye.png`; 11 frames per layer following the sheet convention above. Colours come from the phenotype, never baked in.
- Palette: hand art uses greyscale for shading layers and pure white masks for pattern layers; posterise to steps of 6 to match the generator.
- Plants: one PNG per leaf type plus a JSON describing architecture and growth stages; sway stays procedural.
- Hardscape: single PNG, origin bottom-centre, top-left light, with a separate back-layer variant optional.
- Update this file and `ARCHITECTURE.md` when adding a pipeline step.

## Overworld tanks

Each tank shows a tiny live view: water tint from clarity and algae, little plant strokes, 3px fish in species colours, bubbles, a light that dims at night, and a status bubble.

## Future art work

- Hand-pixelled character sheets with more variety; animated shop details.
- Disease visuals (white spots, fin rot), egg sprites on glass and plants.
- Blackwater (leaf litter, tannin tint), marine palette, coral and live rock.
- Paludarium and vivarium habitat views (land, emergent plants, misting).
