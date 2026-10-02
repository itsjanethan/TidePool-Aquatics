export const clamp = (v: number, min: number, max: number): number => (v < min ? min : v > max ? max : v);
export const clamp01 = (v: number): number => clamp(v, 0, 1);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
/** Move `v` toward `target` by at most `step`. */
export const approach = (v: number, target: number, step: number): number =>
  v < target ? Math.min(target, v + step) : Math.max(target, v - step);
/** Exponential smoothing toward target with rate per unit time. */
export const smooth = (v: number, target: number, rate: number, dt: number): number =>
  target + (v - target) * Math.exp(-rate * dt);
export const round = (v: number, dp = 0): number => {
  const m = 10 ** dp;
  return Math.round(v * m) / m;
};
export const formatMoney = (v: number): string => {
  const neg = v < 0;
  const s = Math.abs(v).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${neg ? '-' : ''}£${s}`;
};
