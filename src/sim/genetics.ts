/**
 * GeneticsSystem: genotypes, expression, inheritance, mutation and strains.
 * Loci and morph rules are data (src/data/genetics.ts).
 */
import { clamp } from '../core/math';
import type { Rng } from '../core/rng';
import { GENETICS, type AlleleDef, type LocusDef } from '../data/genetics';
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
      return !!locus && expressed(locus, pairFor(locus, loci)) === allele;
    });
    if (ok) return rule.morph;
  }
  return g.rules[g.rules.length - 1].morph;
}

/** One allele drawn by supplier-population frequency. */
function drawAllele(l: LocusDef, rng: Rng): string {
  const total = l.alleles.reduce((t, a) => t + (a.freq ?? 1), 0);
  let r = rng.next() * total;
  for (const a of l.alleles) {
    r -= a.freq ?? 1;
    if (r <= 0) return a.id;
  }
  return l.alleles[l.alleles.length - 1].id;
}

/** Allele pair for a locus, defaulting to the common (first) allele for loci added after a fish was saved. */
export function pairFor(l: LocusDef, loci: Record<string, [string, string]>): [string, string] {
  return loci[l.id] ?? [l.alleles[0].id, l.alleles[0].id];
}

export interface ExpressedTrait {
  locus: LocusDef;
  allele: AlleleDef;
  /** 1 = full effect; 0.5 for one copy of an additive (incompletely dominant) allele. */
  weight: number;
}

/** Visible allele effects of a genotype, in locus order. */
export function expressedTraits(speciesId: string, loci: Record<string, [string, string]>): ExpressedTrait[] {
  const g = GENETICS[speciesId];
  if (!g) return [];
  const out: ExpressedTrait[] = [];
  for (const l of g.loci) {
    const pair = pairFor(l, loci);
    if (l.additive) {
      // Count copies of each non-baseline allele.
      for (const a of l.alleles) {
        if (a.dom === 0 || !a.visual) continue;
        const n = (pair[0] === a.id ? 1 : 0) + (pair[1] === a.id ? 1 : 0);
        if (n) out.push({ locus: l, allele: a, weight: n / 2 });
      }
      continue;
    }
    const ex = expressed(l, pair);
    const allele = l.alleles.find((a) => a.id === ex);
    if (allele) out.push({ locus: l, allele, weight: 1 });
  }
  return out;
}

/** Traits a particular fish actually shows (male-only traits hidden in females and juveniles). */
export function shownTraits(f: FishEntity): ExpressedTrait[] {
  const showsMale = f.sex === 'male' && f.ageDays >= getSpecies(f.speciesId).maturityDays;
  return expressedTraits(f.speciesId, f.genes.loci).filter((t) => !t.locus.maleOnly || showsMale);
}

/** Words describing visible extra traits, e.g. ["Albino", "Double Sword"]. */
export function traitLabels(f: FishEntity): string[] {
  return shownTraits(f)
    .filter((t) => t.allele.label && t.weight >= 0.5)
    .map((t) => (t.weight < 1 ? `Half ${t.allele.label}` : t.allele.label!));
}

/** Price multiplier from visible traits (capped so stacked traits stay sane). */
export function traitValue(f: FishEntity): number {
  let v = 1;
  for (const t of shownTraits(f)) v *= 1 + ((t.allele.value ?? 1) - 1) * t.weight;
  return Math.min(2.5, v);
}

/** A random genotype that expresses `morphId` (rejection sampling over allele draws). */
export function genotypeForMorph(speciesId: string, morphId: string, rng: Rng): Record<string, [string, string]> {
  const g = GENETICS[speciesId];
  if (!g) return {};
  let last: Record<string, [string, string]> = {};
  for (let attempt = 0; attempt < 3000; attempt++) {
    const loci: Record<string, [string, string]> = {};
    for (const l of g.loci) loci[l.id] = [drawAllele(l, rng), drawAllele(l, rng)];
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
      const m = pairFor(l, mother.loci);
      const f = pairFor(l, father.loci);
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
    const pair = pairFor(l, f.genes.loci);
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
