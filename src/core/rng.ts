/**
 * Seeded deterministic RNG (mulberry32). State lives in GameState so a
 * loaded save continues the same random sequence.
 */
export class Rng {
  constructor(public state: number) {
    if (!Number.isFinite(state)) this.state = 1;
  }

  next(): number {
    let t = (this.state = (this.state + 0x6d2b79f5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  int(min: number, maxInclusive: number): number {
    return Math.floor(this.range(min, maxInclusive + 1));
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length) % arr.length];
  }

  weighted<T>(items: readonly T[], weight: (t: T) => number): T {
    const total = items.reduce((s, i) => s + Math.max(0, weight(i)), 0);
    let r = this.next() * total;
    for (const i of items) {
      r -= Math.max(0, weight(i));
      if (r <= 0) return i;
    }
    return items[items.length - 1];
  }

  /** Shuffles in place (Fisher-Yates) and returns the array. */
  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  /** Approximately normal, mean 0, sd 1. */
  gaussian(): number {
    return (this.next() + this.next() + this.next() + this.next() - 2) * 1.732;
  }
}

/** Unseeded RNG for purely cosmetic rendering randomness. */
export const visualRng = new Rng((Math.random() * 2 ** 31) | 0);
