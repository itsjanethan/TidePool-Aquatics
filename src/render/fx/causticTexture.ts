/**
 * A tileable caustic network made the way real caustics form: light falling
 * through a rippled water surface is bent by the slope of the surface and
 * piles up into bright filaments on the bed. We trace a grid of photons
 * through a periodic wave height field, splat where each lands and normalise.
 * Generated once in code (no image assets), about 30 ms.
 *
 * Channels: R = caustic intensity, G = smooth stripes used for light shafts
 * (varies along x, slowly along y), B = 0, A = 255.
 */
import { Rng } from '../../core/rng';

export const CAUSTIC_SIZE = 256;

export function paintCaustics(size = CAUSTIC_SIZE, seed = 1307): Uint8ClampedArray<ArrayBuffer> {
  const N = size;
  const rng = new Rng(seed);
  // Periodic waves: integer wave numbers keep the pattern tileable.
  const waves: Array<{ kx: number; ky: number; a: number; ph: number }> = [];
  // A spread of directions and wavelengths, longer waves stronger (like a real ripple spectrum).
  for (let i = 0; i < 16; i++) {
    const kx = rng.int(-6, 6);
    const ky = rng.int(1, 6) * (rng.chance(0.5) ? 1 : -1);
    const k = Math.hypot(kx, ky);
    waves.push({ kx: (kx * Math.PI * 2) / N, ky: (ky * Math.PI * 2) / N, a: 1 / Math.pow(k, 2.2), ph: rng.range(0, Math.PI * 2) });
  }
  const acc = new Float32Array(N * N);
  const M = Math.round(N * 1.5);
  const step = N / M;
  // Depth of the bed below the surface, in texture px per unit slope.
  const depth = N * 1.15;
  for (let j = 0; j < M; j++) {
    for (let i = 0; i < M; i++) {
      const x = i * step;
      const y = j * step;
      let gx = 0;
      let gy = 0;
      for (const w of waves) {
        const c = Math.cos(w.kx * x + w.ky * y + w.ph) * w.a;
        gx += c * w.kx;
        gy += c * w.ky;
      }
      let px = x - gx * depth;
      let py = y - gy * depth;
      px = ((px % N) + N) % N;
      py = ((py % N) + N) % N;
      const x0 = Math.floor(px);
      const y0 = Math.floor(py);
      const fx = px - x0;
      const fy = py - y0;
      const x1 = (x0 + 1) % N;
      const y1 = (y0 + 1) % N;
      acc[y0 * N + x0] += (1 - fx) * (1 - fy);
      acc[y0 * N + x1] += fx * (1 - fy);
      acc[y1 * N + x0] += (1 - fx) * fy;
      acc[y1 * N + x1] += fx * fy;
    }
  }
  // Light blur (the sun is not a point; also hides the photon grid), then normalise to the mean.
  let blur = acc;
  for (let pass = 0; pass < 2; pass++) {
    const src = blur;
    blur = new Float32Array(N * N);
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        let s = src[y * N + x] * 4;
        s += src[y * N + ((x + 1) % N)] + src[y * N + ((x + N - 1) % N)] + src[((y + 1) % N) * N + x] + src[((y + N - 1) % N) * N + x];
        blur[y * N + x] = s / 8;
      }
    }
  }
  let mean = 0;
  for (const v of blur) mean += v;
  mean /= N * N;
  const out = new Uint8ClampedArray(new ArrayBuffer(N * N * 4));
  // Shaft stripes: tileable 1-D value noise along x with a slow y drift.
  const lattice = Array.from({ length: 16 }, () => rng.next());
  const lattice2 = Array.from({ length: 32 }, () => rng.next());
  const vn = (u: number, lat: number[]) => {
    const n = lat.length;
    const f = ((u % n) + n) % n;
    const i0 = Math.floor(f);
    const t = f - i0;
    const s = t * t * (3 - 2 * t);
    return lat[i0] + (lat[(i0 + 1) % n] - lat[i0]) * s;
  };
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const v = blur[y * N + x] / mean;
      const c = Math.pow(Math.max(0, (v - 0.55) / 2.4), 0.85);
      const i = (y * N + x) * 4;
      out[i] = Math.min(255, Math.round(c * 255));
      const u = x / N + (y / N) * 0.0625;
      out[i + 1] = Math.round((vn(u * 16, lattice) * 0.65 + vn(u * 32, lattice2) * 0.35) * 255);
      out[i + 2] = 0;
      out[i + 3] = 255;
    }
  }
  return out;
}
