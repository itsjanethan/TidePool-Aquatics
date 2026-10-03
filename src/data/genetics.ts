/**
 * Simplified, data-driven genetics per species. Each locus has alleles with a
 * dominance rank (higher wins; equal ranks: the first listed allele wins).
 * A fish's visible morph is the first rule whose required alleles are all
 * expressed. Real genetics are far messier: these are chosen so breeding is
 * readable and interesting (hidden recessives, true-breeding lines).
 * See SPECIES_SCHEMA.md.
 */

export interface AlleleDef {
  id: string;
  name: string;
  dom: number;
}

export interface LocusDef {
  id: string;
  /** Player-facing trait name, e.g. "Colour". */
  name: string;
  alleles: AlleleDef[];
}

export interface MorphRule {
  morph: string;
  /** locus id -> allele id that must be expressed. Empty = fallback. */
  when: Record<string, string>;
}

export interface GeneticsDef {
  loci: LocusDef[];
  rules: MorphRule[];
}

const L = (id: string, name: string, alleles: Array<[string, string, number]>): LocusDef => ({
  id,
  name,
  alleles: alleles.map(([aid, aname, dom]) => ({ id: aid, name: aname, dom })),
});

export const GENETICS: Record<string, GeneticsDef> = {
  guppy: {
    loci: [L('colour', 'Colour', [['R', 'Red', 3], ['B', 'Blue', 2], ['G', 'Green', 1], ['w', 'Wild', 0]])],
    rules: [
      { morph: 'red_delta', when: { colour: 'R' } },
      { morph: 'blue_mosaic', when: { colour: 'B' } },
      { morph: 'cobra_green', when: { colour: 'G' } },
      { morph: 'wild', when: {} },
    ],
  },
  endler: {
    loci: [L('colour', 'Colour', [['K', 'Black bar', 2], ['T', 'Tiger', 1], ['j', 'Japan blue', 0]])],
    rules: [
      { morph: 'black_bar', when: { colour: 'K' } },
      { morph: 'tiger', when: { colour: 'T' } },
      { morph: 'japan_blue', when: {} },
    ],
  },
  platy: {
    loci: [
      L('colour', 'Colour', [['R', 'Red', 2], ['S', 'Sunset', 1], ['b', 'Blue', 0]]),
      L('spot', 'Tail spot', [['M', 'Mickey spot', 1], ['n', 'Plain', 0]]),
    ],
    rules: [
      { morph: 'mickey', when: { spot: 'M' } },
      { morph: 'red', when: { colour: 'R' } },
      { morph: 'sunset', when: { colour: 'S' } },
      { morph: 'blue_wag', when: {} },
    ],
  },
  molly: {
    loci: [L('colour', 'Colour', [['B', 'Black', 2], ['D', 'Dalmatian', 1], ['g', 'Gold dust', 0]])],
    rules: [
      { morph: 'black', when: { colour: 'B' } },
      { morph: 'dalmatian', when: { colour: 'D' } },
      { morph: 'gold', when: {} },
    ],
  },
  neon_tetra: {
    loci: [L('colour', 'Colour', [['S', 'Standard', 1], ['g', 'Gold', 0]])],
    rules: [
      { morph: 'standard', when: { colour: 'S' } },
      { morph: 'gold', when: {} },
    ],
  },
  zebra_danio: {
    loci: [
      L('pattern', 'Pattern', [['S', 'Stripes', 1], ['l', 'Leopard', 0]]),
      L('fins', 'Fins', [['F', 'Long fins', 1], ['s', 'Short fins', 0]]),
    ],
    rules: [
      { morph: 'leopard', when: { pattern: 'l' } },
      { morph: 'longfin', when: { fins: 'F' } },
      { morph: 'wild', when: {} },
    ],
  },
  white_cloud: {
    loci: [
      L('colour', 'Colour', [['W', 'Wild', 1], ['g', 'Golden', 0]]),
      L('fins', 'Fins', [['M', 'Meteor long fins', 1], ['s', 'Short fins', 0]]),
    ],
    rules: [
      { morph: 'meteor', when: { fins: 'M' } },
      { morph: 'golden', when: { colour: 'g' } },
      { morph: 'wild', when: {} },
    ],
  },
  bronze_cory: {
    loci: [L('pigment', 'Pigment', [['P', 'Normal', 1], ['a', 'Albino', 0]])],
    rules: [
      { morph: 'albino', when: { pigment: 'a' } },
      { morph: 'bronze', when: {} },
    ],
  },
  bristlenose: {
    loci: [
      L('pigment', 'Pigment', [['P', 'Normal', 1], ['a', 'Albino', 0]]),
      L('red', 'Red', [['N', 'Normal', 1], ['r', 'Super red', 0]]),
    ],
    rules: [
      { morph: 'super_red', when: { red: 'r' } },
      { morph: 'albino', when: { pigment: 'a' } },
      { morph: 'common', when: {} },
    ],
  },
  fancy_goldfish: {
    loci: [L('colour', 'Colour', [['O', 'Red', 3], ['K', 'Black', 2], ['C', 'Calico', 1], ['w', 'Red cap', 0]])],
    rules: [
      { morph: 'oranda', when: { colour: 'O' } },
      { morph: 'moor', when: { colour: 'K' } },
      { morph: 'calico', when: { colour: 'C' } },
      { morph: 'redcap', when: {} },
    ],
  },
};
