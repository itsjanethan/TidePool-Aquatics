/**
 * Pure inputs for the water optics pass (no Phaser), so they can be unit
 * tested: world-space rectangles and amounts derived from tank state, mapped
 * through the camera to the shader's screen-uv uniforms.
 */
/** Values the pass needs, in world (tank canvas) coordinates. */
export interface OpticsInput {
  /** Tank glass rectangle (world px). */
  tank: { x0: number; y0: number; x1: number; y1: number };
  /** Water body, or null for a land-only enclosure. */
  water: { x0: number; y0: number; x1: number; y1: number } | null;
  /** Light map rectangle (world px). */
  lightMap: { x0: number; y0: number; x1: number; y1: number };
  /** The bed line (world y). */
  floor: number;
  /** Light level 0..1 (ramps when the light switches). */
  lit: number;
  /** Light colour (0xRRGGBB). */
  light: number;
  /** Water colour seen by scattering (0xRRGGBB). */
  waterColour: number;
  caustics: number;
  rays: number;
  fog: number;
  glass: number;
  /** Mirror band height under the surface (world px; 0 = off). */
  mirror: number;
  smoothEdges: boolean;
  /** 0..1 humid haze in land air (0 for aquariums). */
  haze: number;
}

/** Uniform values for a camera that maps world to screen as screen = (world - scroll) * zoom. */
export interface OpticsUniforms {
  tank: [number, number, number, number];
  water: [number, number, number, number];
  lm: [number, number, number, number];
  world: [number, number];
  floor: number;
  lit: number;
  waterCol: [number, number, number];
  lightCol: [number, number, number];
  amt: [number, number, number, number];
  amt2: [number, number, number, number];
}

const rgb = (c: number): [number, number, number] => [((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255];

/**
 * Pure mapping from world-space inputs and the camera to shader uniforms.
 * Screen uv has y measured from the top; `w`/`h` are the render size.
 */
export function opticsUniforms(o: OpticsInput, cam: { scrollX: number; scrollY: number; zoom: number; w: number; h: number }): OpticsUniforms {
  const ux = (x: number) => ((x - cam.scrollX) * cam.zoom) / cam.w;
  const uy = (y: number) => ((y - cam.scrollY) * cam.zoom) / cam.h;
  const rect = (r: { x0: number; y0: number; x1: number; y1: number }): [number, number, number, number] => [ux(r.x0), uy(r.y0), ux(r.x1), uy(r.y1)];
  const water: [number, number, number, number] = o.water ? rect(o.water) : [2, 2, -1, -1];
  return {
    tank: rect(o.tank),
    water,
    lm: rect(o.lightMap),
    world: [o.tank.x1 - o.tank.x0, o.tank.y1 - o.tank.y0],
    floor: uy(o.floor),
    lit: o.lit,
    waterCol: rgb(o.waterColour),
    lightCol: rgb(o.light),
    amt: [o.caustics, o.rays, o.fog, o.glass],
    // Mirror band in screen-uv height.
    amt2: [o.water ? (o.mirror * cam.zoom) / cam.h : 0, o.smoothEdges ? 1 : 0, o.haze, 0],
  };
}
