# Art Direction

## Reference feel

Polished late-era handheld RPG interiors: clean top-down tiles, small expressive characters, dense but readable rooms, chunky dialogue boxes. Everything is original. Never copy assets, characters, maps, music, sprites or code from existing games (Pokemon or otherwise).

## Technical frame

- Logical resolution 480 x 320 (3:2); the canvas is 960 x 640 (`RES = 2`). The shop is drawn at 480 x 320 with camera zoom 2 (crisp pixel art); the tank view draws natively at 960 x 640 for smoother fish and plants while keeping a pixel-art look. Nearest-neighbour filtering (`pixelArt: true`).
- Tiles are 16 x 16. Characters are 16 x 16 frames (plus 1px headroom), four directions, three frames each (idle, step A, step B).
- The shop floor (30 x 20 tiles) fits the screen exactly; the camera does not scroll on Floor 1. Larger floors should use a follow camera.
- HTML UI overlays use Jersey 10 (body) and Tiny5 (logo), bundled with the build, sized in logical pixels via `--px`. Any replacement font must render digits unambiguously (the previous font drew 2 and 5 mirrored) and include ★ ☆ ♂ ♀ ◀ ▶ ▲ ▼ ⚠ or have a fallback that does.

## Procedural art

All current art is generated at runtime in `src/render/art/`. This keeps the build self-contained and lets content scale (every species and morph gets art from data). Hand-drawn assets can replace generators later: keep texture keys and frame names stable (`player`, `cust:<seed>`, `prop-<kind>-<w>x<h>`, `fishhd:<species>:<morph>:<sex>:<length>` with 8 swim frames).

- **Shop** (`shopArt.ts`): warm cream checker vinyl floor, teal striped wall with wooden skirting, dark plum wall tops, wooden tank stands with black hoods, colourful dry-goods shelves, glowing office PC, potted plants, benches, a fish plaque sign.
- **Characters** (`characters.ts`): row templates with palette letters (`o` outline, `h` hair, `s` skin, `e` eyes, `c` shirt, `p` trousers, `f` shoes). Customers get seeded palettes. The player wears a teal shop shirt with a white apron patch.
- **Fish** (`fishArt.ts`): drawn from body shape, fin style, height ratio and morph colours at tank-view resolution. Fish face right; eight frames animate a foreshortened beating tail, rayed translucent fins and pectoral flutter. Rounded shading with a shine line and scale lattice on larger fish. Darker back, lighter belly, outline from the body colour, eye with highlight on larger fish, gill line, dorsal/anal/pectoral fins, patterns (neon stripe, stripes, bars, spots, mosaic tails, tail spot, calico, speckle). Female livebearers get short tails and their own colours.
- **Decor** (`decorArt.ts`): hardscape as static textures (stones, slate stacks with crevices, holey limestone, two-tone mopani, branching spider wood, clay caves, coconut huts). Hardscape gets ball shading from the top-left light. Plants are leaves drawn every frame so they sway with water flow; their height and leaf count follow growth (`size`), with shading, and overgrown stem plants trail along the surface.

## Palette guidance

- UI panels: deep navy `#1d2340` with cream `#f2eedc` and periwinkle `#4d6cb8` double borders, gold `#ffd45a` titles and selection arrow.
- Dialogue box: cream `#f8f6ec` with periwinkle inner border, speaker tab on the top-left.
- Status: good `#6fdc7f`, warning `#ffbf4a`, bad `#ff6a5a`, info `#6ec8ff`.
- Water: clear tanks lean teal-blue; algae pushes green; cloudiness pushes milky grey; night overlays deep blue.

## Aquarium view

- The tank fills the screen: glass from x 28 to 932, surface at y 92, substrate from y 532 (canvas pixels, `VIEW` in `tankRenderer.ts`).
- Fish are drawn about 1.7x true scale so small species read clearly; they ease into turns (squash), swim burst-and-coast, drift between depth planes (smaller and further back), and cast soft shadows on the substrate.
- Light: animated caustics on substrate and water, additive light rays, animated surface line, glass sheen and vignette.
- Pixels per cm scale with tank length, so a guppy looks bigger in a 40L than in a 120L tank, like real life.
- Layers back to front: background print, light rays (additive), heater/filter, back decor and plants, substrate, fish (depth-sorted by individual z), middle decor, food, front decor, bubbles and particles, night tint, cloudiness, algae, glass dirt, frame.
- Neglect must be readable at a glance: green algae blotches, brown film and streaks on the glass, milky water, dead fish floating upside down near the surface, pale grey-blue tint on stressed or sick fish.
- Behaviour should read as natural: burst-and-glide speed, smooth squash turns, schooling, corydoras sifting and darting up for air, plecos resting by day and grazing at night, goldfish wobbling through the whole water column.

## Overworld tanks

Each tank shows a tiny live view: water tint from clarity and algae, little plant strokes, 3px fish in species colours at their swim level, bubbles, a light that dims at night, and a bouncing status bubble (red "!" dead or toxic, yellow dots hungry, green dirty).

## Future art work

- Hand-pixelled character sheets with more variety (hats, kids, elderly customers, staff uniforms).
- Animated shop details (till drawer, door opening, ceiling lights).
- Marine palette: brighter blues, live rock, coral silhouettes.
- Egg sprites (fry already render as tiny fish), disease visuals (white spots, fin rot).
