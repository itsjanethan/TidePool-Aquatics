/**
 * GeneticsSystem: genotypes, expression, inheritance, mutation and strains.
 * Loci and morph rules are data (src/data/genetics.ts).
 */
import { clamp } from '../core/math';
import type { Rng } from '../core/rng';
import { GENETICS, type LocusDef } from '../data/genetics';
import { getSpecies } from '../data/species';
import type { FishEntity, FishGenes, GameState, Strain } from './types';

export const MUTATION_CHANCE = 0.004;

export function hasGenetics(speciesId: string): boolean {
  return !!GENETICS[speciesId];
}

/** Allele shown for a locus (higher dominance wins; ties: first listed). */
export function expressed(locus: LocusDef, pair: [string, string]): string {
  const rank = (id: string) => locus.alleles.find((a) => a.id === id)?.dom ?? -1;
  const order = (id: string) => locus.alleles.findIndex((a) => a.id === id);
  const [a, b] = pair;
  if (rank(a) !== rank(b)) return rank(a) > rank(b) ? a : b;
  return order(a) <= order(b) ? a : b;
}

/** Visible morph for a genotype, or null when the species has no genetics. */
export function morphFromGenes(speciesId: string, loci: Record<string, [string, string]>): string | null {
  const g = GENETICS[speciesId];
  if (!g) return null;
  for (const rule of g.rules) {
    const ok = Object.entries(rule.when).every(([lid, allele]) => {
      const locus = g.loci.find((l) => l.id === lid);
      const pair = loci[lid];
      return !!locus && !!pair && expressed(locus, pair) === allele;
    });
    if (ok) return rule.morph;
  }
  return g.rules[g.rules.length - 1].morph;
}

/** A random genotype that expresses `morphId` (rejection sampling over allele draws). */
export function genotypeForMorph(speciesId: string, morphId: string, rng: Rng): Record<string, [string, string]> {
  const g = GENETICS[speciesId];
  if (!g) return {};
  let last: Record<string, [string, string]> = {};
  for (let attempt = 0; attempt < 400; attempt++) {
    const loci: Record<string, [string, string]> = {};
    for (const l of g.loci) {
      const ids = l.alleles.map((a) => a.id);
      loci[l.id] = [rng.pick(ids), rng.pick(ids)];
    }
    last = loci;
    if (morphFromGenes(speciesId, loci) === morphId) return loci;
  }
  return last;
}

export interface InheritResult {
  genes: FishGenes;
  mutated: boolean;
}

/** Child genes from two parents: one allele per locus from each, plus polygenic traits. */
export function inherit(speciesId: string, mother: FishGenes, father: FishGenes, rng: Rng): InheritResult {
  const g = GENETICS[speciesId];
  const loci: Record<string, [string, string]> = {};
  let mutated = false;
  if (g) {
    for (const l of g.loci) {
      const m = mother.loci[l.id] ?? [l.alleles[0].id, l.alleles[0].id];
      const f = father.loci[l.id] ?? [l.alleles[0].id, l.alleles[0].id];
      let a = rng.pick(m);
      let b = rng.pick(f);
      if (rng.chance(MUTATION_CHANCE)) {
        a = rng.pick(l.alleles).id;
        mutated = true;
      }
      if (rng.chance(MUTATION_CHANCE)) {
        b = rng.pick(l.alleles).id;
        mutated = true;
      }
      loci[l.id] = [a, b];
    }
  }
  // Polygenic traits: mid-parent value with mild regression to the mean and noise,
  // so selection pays off gradually without values running away.
  const quality = clamp((mother.quality + father.quality) / 2 * 0.9 + 0.05 + rng.gaussian() * 0.06, 0.05, 1);
  const size = clamp((mother.size + father.size) / 2 * 0.9 + 0.1 + rng.gaussian() * 0.03, 0.85, 1.18);
  return { genes: { loci, quality, size }, mutated };
}

export interface TraitView {
  name: string;
  shown: string;
  /** Hidden allele when heterozygous (only when known to the player). */
  carries: string | null;
}

/**
 * Player-facing trait summary. Hidden carrier alleles are only revealed for
 * fish whose genotype the player can know: shop-bred fish and proven parents.
 */
export function traitView(f: FishEntity): TraitView[] {
  const g = GENETICS[f.speciesId];
  if (!g) return [];
  const known = genotypeKnown(f);
  return g.loci.map((l) => {
    const pair = f.genes.loci[l.id];
    if (!pair) return { name: l.name, shown: '?', carries: null };
    const ex = expressed(l, pair);
    const other = pair[0] === ex ? pair[1] : pair[0];
    const nm = (id: string) => l.alleles.find((a) => a.id === id)?.name ?? id;
    return { name: l.name, shown: nm(ex), carries: known && other !== ex ? nm(other) : null };
  });
}

export function genotypeKnown(f: FishEntity): boolean {
  return f.origin === 'bred' || f.offspringCount > 0;
}

// ---------------------------------------------------------------------------
// Strains


/** Why a fish can or cannot found a named strain. */
export function strainEligibility(state: GameState, f: FishEntity): { ok: boolean; reason: string } {
  if (f.strainName) return { ok: false, reason: 'This fish already belongs to a strain.' };
  if (f.origin !== 'bred') return { ok: false, reason: 'Only fish bred in your shop can found a strain.' };
  if (f.generation < 2) return { ok: false, reason: 'Breed at least two generations (F2) first.' };
  const mum = f.parents.motherId ? state.fish[f.parents.motherId] : null;
  const dad = f.parents.fatherId ? state.fish[f.parents.fatherId] : null;
  const bredParents = [mum, dad].filter((p) => p && p.origin === 'bred' && p.morphId === f.morphId).length;
  if (bredParents < 2) return { ok: false, reason: 'Both parents must be shop-bred and show the same look.' };
  return { ok: true, reason: 'This line breeds true enough to name.' };
}

/** Creates a strain and assigns it to the fish, its parents and same-look siblings. */
export function establishStrain(state: GameState, f: FishEntity, name: string): Strain | null {
  const elig = strainEligibility(state, f);
  if (!elig.ok) return null;
  const strains = (state.strains ??= {});
  const id = `s${Object.keys(strains).length + 1}_${f.id}`;
  const strain: Strain = { id, name: name.trim().slice(0, 28) || 'Unnamed line', speciesId: f.speciesId, morphId: f.morphId, foundedDay: Math.floor(state.minute / 1440) + 1, bestGeneration: f.generation };
  strains[id] = strain;
  const family = Object.values(state.fish).filter(
    (x) =>
      x.alive &&
      x.speciesId === f.speciesId &&
      x.morphId === f.morphId &&
      (x.id === f.id || x.id === f.parents.motherId || x.id === f.parents.fatherId ||
        (x.parents.motherId === f.parents.motherId && x.parents.fatherId === f.parents.fatherId)),
  );
  for (const x of family) x.strainName = id;
  return strain;
}

/** Strain a fry inherits: both parents in the same strain and the fry shows its look. */
export function inheritedStrain(state: GameState, mother: FishEntity, father: FishEntity, childMorph: string, childGen: number): string | null {
  const sid = mother.strainName && mother.strainName === father.strainName ? mother.strainName : null;
  if (!sid) return null;
  const strain = state.strains?.[sid];
  if (!strain || strain.morphId !== childMorph) return null;
  strain.bestGeneration = Math.max(strain.bestGeneration, childGen);
  return sid;
}

export function strainLabel(state: GameState, f: FishEntity): string | null {
  if (!f.strainName) return null;
  const s = state.strains?.[f.strainName];
  return s ? `${s.name} F${f.generation}` : null;
}

export function speciesHasStrains(speciesId: string): boolean {
  return !!getSpecies(speciesId) && hasGenetics(speciesId);
}
