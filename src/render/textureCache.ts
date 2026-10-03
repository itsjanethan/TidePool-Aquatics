/**
 * Bounded caches for generated textures that are made per tank (substrate
 * beds, mulm). Visiting many tanks in one session would otherwise keep every
 * one alive. Each group keeps its most recently used keys; older ones are
 * removed from the texture manager. Keys in `keep` (in use right now) are
 * never removed.
 */
import type Phaser from 'phaser';

const groups = new Map<string, string[]>();

export function useTexture(scene: Phaser.Scene, group: string, key: string, max: number, keep: Iterable<string> = []): void {
  const list = groups.get(group) ?? [];
  const i = list.indexOf(key);
  if (i >= 0) list.splice(i, 1);
  list.push(key);
  const protect = new Set([key, ...keep]);
  while (list.length > max) {
    const victim = list.find((k) => !protect.has(k));
    if (!victim) break;
    list.splice(list.indexOf(victim), 1);
    if (scene.textures.exists(victim)) scene.textures.remove(victim);
  }
  groups.set(group, list);
}

/** Keys currently cached in a group (tests, profiling). */
export function cachedTextures(group: string): string[] {
  return [...(groups.get(group) ?? [])];
}
