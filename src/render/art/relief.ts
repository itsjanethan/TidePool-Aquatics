/**
 * Shared finishing passes for painted textures (hardscape, corals).
 *
 * Micro-relief treats the painted surface as a height field (brightness plus
 * fine noise) and relights it from the upper left, so stone grain, bark
 * fissures, coral skeleton and polyp texture catch light and cast tiny
 * shadows like a photograph of the real material. Then one texel of
 * anti-aliasing on the silhouette.
 */
function h2(x: number, y: number, s: number): number {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function noise(x: number, y: number, s: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = h2(xi, yi, s);
  const b = h2(xi + 1, yi, s);
  const c = h2(xi, yi + 1, s);
  const d = h2(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const fbm = (x: number, y: number, s: number) => noise(x, y, s) * 0.6 + noise(x * 2.1, y * 2.1, s + 7) * 0.3 + noise(x * 4.3, y * 4.3, s + 13) * 0.1;

export interface RGBAImage {
  w: number;
  h: number;
  data: Uint8ClampedArray;
}

export function relief(img: RGBAImage, strength: number, seed: number, scale: number): void {
  const { w, h, data } = img;
  const H = new Float32Array(w * h);
  const f = 0.35 / Math.max(0.5, scale);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    const j = i * 4;
    if (data[j + 3] < 8) continue;
    const l = (data[j] * 0.3 + data[j + 1] * 0.55 + data[j + 2] * 0.15) / 255;
    H[i] = l * 0.65 + fbm(x * f, y * f, seed + 77) * 0.35;
  }
  const out = data.slice();
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    const j = i * 4;
    if (data[j + 3] < 8) continue;
    const gx = H[i + 1] - H[i - 1];
    const gy = H[i + w] - H[i - w];
    // Light from the upper left: slopes facing it brighten, the others darken.
    const k = 1 + Math.max(-0.45, Math.min(0.45, (-gx * 0.6 - gy * 0.8) * strength * 3));
    out[j] = data[j] * k;
    out[j + 1] = data[j + 1] * k;
    out[j + 2] = data[j + 2] * k;
  }
  data.set(out);
  // Anti-aliased silhouette.
  const src = data.slice();
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const j = (y * w + x) * 4;
    const a0 = src[j + 3];
    let an = 0;
    let r = 0;
    let g = 0;
    let b = 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const xx = x + dx;
      const yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
      const k = (yy * w + xx) * 4;
      an += src[k + 3];
      r += src[k] * src[k + 3];
      g += src[k + 1] * src[k + 3];
      b += src[k + 2] * src[k + 3];
    }
    const a1 = (a0 * 4 + an) / 8;
    if (Math.abs(a1 - a0) < 10) continue;
    if (a0 === 0 && an > 0) {
      data[j] = r / an;
      data[j + 1] = g / an;
      data[j + 2] = b / an;
    }
    data[j + 3] = a1;
  }
}
