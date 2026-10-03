/**
 * How simulation state turns into tank-view effects. Kept pure so tests can
 * check that every effect follows the real tank (and only the real tank).
 */
import { clamp } from '../core/math';

/** Mulm on the substrate: shows from a little detritus, heavy near a dirty tank's levels. */
export function mulmAlpha(detritus: number): number {
  return clamp((detritus - 0.5) / 5, 0, 0.85);
}

/** Surface film: needs detritus and a still surface (low filter flow, no air stone). */
export function surfaceFilm(detritus: number, flow: number): number {
  return clamp((detritus - 1.5) / 5, 0, 1) * clamp((1.0 - flow) / 0.5, 0, 1);
}

/**
 * Oxygen pearls per second from one plant: only healthy plants (health above
 * 0.6), scaled by light at the leaves, nitrate to feed growth and plant size.
 * Zero with the lights down.
 */
export function pearlRate(health: number, nitrate: number, light: number, size: number, lightLevel: number): number {
  if (lightLevel <= 0.8) return 0;
  const h = clamp((health - 0.6) / 0.4, 0, 1);
  const feed = clamp(0.35 + nitrate / 15, 0.35, 1);
  return 2.5 * h * feed * clamp(light, 0, 1) * Math.min(1.5, size);
}

/** Hardscape tint: back layer cooler, darker where the light map is shaded, greener with algae. */
export function hardscapeTint(layer: number, light: number, algae: number, lightLevel: number): number {
  const a = clamp(algae, 0, 1) * 0.5;
  const k = 0.72 + 0.28 * clamp(light, 0, 1) * (0.4 + 0.6 * lightLevel);
  const base = layer === 0 ? [0xc8, 0xd4, 0xdc] : [0xff, 0xff, 0xff];
  const green = [0x8a, 0xa8, 0x5a];
  const c = base.map((v, i) => clamp(Math.round((v + (green[i] - v) * a) * k), 0, 255));
  return (c[0] << 16) | (c[1] << 8) | c[2];
}

/** Lights fade over about a second. */
export function stepLightLevel(level: number, on: boolean, dt: number): number {
  return clamp(level + (on ? dt : -dt) / 1.2, 0, 1);
}
