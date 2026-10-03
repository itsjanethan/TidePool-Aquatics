/**
 * Habitat needs in player-facing numbers: hiding cover %, cave slots, open
 * swimming space, substrate and wood. Shared by stress, diagnostics, advice
 * and staff suggestions so "how much is enough" is defined once.
 */
import { getSpecies } from '../data/species';
import type { HabitatNeeds, SpeciesDef } from '../data/speciesTypes';
import type { AquascapeSummary } from './aquascape';
import type { FishEntity } from './types';

/** Species habitat needs with defaults for species without explicit data. */
export function habitatOf(sp: SpeciesDef): Required<Omit<HabitatNeeds, 'substrate'>> & { substrate?: 'sand' } {
  const h = sp.habitat;
  return {
    cover: h?.cover ?? Math.min(0.7, 0.15 + sp.behaviour.shyness * 0.7),
    caves: h?.caves ?? (sp.tags.includes('needs_cave') ? 1 : 0),
    openSpace: h?.openSpace ?? (sp.behaviour.schooling > 0.6 ? 0.35 : 0),
    wood: h?.wood ?? sp.tags.includes('needs_wood'),
    substrate: h?.substrate ?? (sp.tags.includes('needs_sand') ? 'sand' : undefined),
  };
}

/** Hiding cover as a percentage (scape.cover is an internal sum; 0.625 = 100%). */
export function coverPercent(scape: AquascapeSummary): number {
  return Math.min(100, Math.round(scape.cover * 160));
}

export interface TankNeeds {
  /** Recommended hiding cover %, set by the shyest species present. */
  coverPct: number;
  /** Species asking for that much cover (shyest first). */
  coverBy: Array<{ speciesId: string; pct: number; count: number }>;
  /** Cave slots wanted by adults present. */
  caveSlots: number;
  caveBy: Array<{ speciesId: string; count: number }>;
  /** Minimum open swimming space 0..1. */
  openSpace: number;
  openBy: string[];
  sandBy: string[];
  woodBy: string[];
}

/** What the fish in a tank need from its aquascape. */
export function tankNeeds(fish: FishEntity[]): TankNeeds {
  const by = new Map<string, FishEntity[]>();
  for (const f of fish) if (f.alive) (by.get(f.speciesId) ?? by.set(f.speciesId, []).get(f.speciesId)!).push(f);
  const needs: TankNeeds = { coverPct: 0, coverBy: [], caveSlots: 0, caveBy: [], openSpace: 0, openBy: [], sandBy: [], woodBy: [] };
  for (const [sid, list] of by) {
    const h = habitatOf(getSpecies(sid));
    const pct = Math.round(h.cover * 100);
    needs.coverBy.push({ speciesId: sid, pct, count: list.length });
    needs.coverPct = Math.max(needs.coverPct, pct);
    if (h.caves > 0) {
      // Only adults claim caves.
      const adults = list.filter((f) => f.sizeCm >= f.adultSizeCm * 0.6).length;
      if (adults) {
        needs.caveSlots += Math.ceil(adults * h.caves);
        needs.caveBy.push({ speciesId: sid, count: adults });
      }
    }
    if (h.openSpace > needs.openSpace) needs.openSpace = h.openSpace;
    if (h.openSpace > 0) needs.openBy.push(sid);
    if (h.substrate === 'sand') needs.sandBy.push(sid);
    if (h.wood) needs.woodBy.push(sid);
  }
  needs.coverBy.sort((a, b) => b.pct - a.pct);
  return needs;
}
