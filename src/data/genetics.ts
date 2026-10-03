/**
 * Simplified, data-driven genetics per species. Each locus has alleles with a
 * dominance rank (higher wins; equal ranks: the first listed allele wins).
 * A fish's visible morph is the first rule whose required alleles are all
 * expressed. Real genetics are far messier: these are chosen so breeding is
 * readable and interesting (hidden recessives, true-breeding lines).
 * See SPECIES_SCHEMA.md.
 */

import type { VisualMod } from './speciesTypes';

export interface AlleleDef {
  id: string;
  name: string;
  dom: number;
  /** Relative frequency in supplier stock (default 1). */
  freq?: number;
  /** Visible effect when expressed. */
  visual?: VisualMod;
  /** Price multiplier when expressed (default 1). */
  value?: number;
  /** Word added to the fish's look name when expressed, e.g. "Albino". */
  label?: string;
}

export interface LocusDef {
  id: string;
  /** Player-facing trait name, e.g. "Colour". */
  name: string;
  alleles: AlleleDef[];
  /**
   * Incomplete dominance: one copy gives half the numeric effect (metallic,
   * melanism, fin size), two copies the full effect.
   */
  additive?: boolean;
  /** Only mature males show it; females and juveniles carry it hidden (e.g. guppy tail shapes). */
  maleOnly?: boolean;
}

type AlleleExtra = Partial<Pick<AlleleDef, 'freq' | 'visual' | 'value' | 'label'>>;

export interface MorphRule {
  morph: string;
  /** locus id -> allele id that must be expressed. Empty = fallback. */
  when: Record<string, string>;
}

export interface GeneticsDef {
  loci: LocusDef[];
  rules: MorphRule[];
}

const L = (id: string, name: string, alleles: Array<[string, string, number, AlleleExtra?]>, additive = false): LocusDef => ({
  id,
  name,
  additive,
  alleles: alleles.map(([aid, aname, dom, extra]) => ({ id: aid, name: aname, dom, ...extra })),
});

const maleOnly = (l: LocusDef): LocusDef => ({ ...l, maleOnly: true });

/** Common trait loci. The first allele is always the wild/common one (old saves default to it). */
const ALBINO = L('albino', 'Pigment', [['A', 'Normal', 1, { freq: 30 }], ['a', 'Albino', 0, { freq: 1, visual: { albino: true }, value: 1.5, label: 'Albino' }]]);
const METALLIC = (freq = 1) => L('metal', 'Sheen', [['m', 'Plain', 0, { freq: 8 }], ['M', 'Metallic', 1, { freq, visual: { metallic: 1 }, value: 1.25, label: 'Metallic' }]], true);

export const GENETICS: Record<string, GeneticsDef> = {
  guppy: {
    loci: [
      L('colour', 'Colour', [['R', 'Red', 3], ['B', 'Blue', 2], ['G', 'Green', 1], ['w', 'Wild', 0]]),
      maleOnly(L('tail', 'Tail', [
        ['D', 'Delta', 2, { freq: 8 }],
        ['S', 'Double sword', 1, { freq: 2, visual: { caudal: 'double_sword' }, value: 1.15, label: 'Double Sword' }],
        ['r', 'Round', 0, { freq: 1.5, visual: { caudal: 'round', caudalSize: 0.7 }, value: 0.9, label: 'Roundtail' }],
      ])),
      maleOnly(L('dorsal', 'Dorsal', [['n', 'Normal', 0, { freq: 6 }], ['B', 'Big dorsal', 1, { freq: 1, visual: { dorsalSize: 1.9 }, value: 1.15, label: 'Big Dorsal' }]])),
      METALLIC(1.2),
      ALBINO,
    ],
    rules: [
      { morph: 'red_delta', when: { colour: 'R' } },
      { morph: 'blue_mosaic', when: { colour: 'B' } },
      { morph: 'cobra_green', when: { colour: 'G' } },
      { morph: 'wild', when: {} },
    ],
  },
  endler: {
    loci: [
      L('colour', 'Colour', [['K', 'Black bar', 2], ['T', 'Tiger', 1], ['j', 'Japan blue', 0]]),
      maleOnly(L('tail', 'Tail', [['n', 'Plain', 1, { freq: 6 }], ['s', 'Double sword', 0, { freq: 2, visual: { caudal: 'double_sword' }, value: 1.2, label: 'Sword' }]])),
      METALLIC(0.8),
    ],
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
      L('fins', 'Fins', [['n', 'Normal', 0, { freq: 8 }], ['H', 'Hi-fin', 1, { freq: 1, visual: { dorsalSize: 2.4, dorsalSail: true }, value: 1.25, label: 'Hi-fin' }]]),
      L('tux', 'Tuxedo', [['n', 'Plain', 0, { freq: 7 }], ['T', 'Tuxedo', 1, { freq: 1.2, visual: { patterns: [{ type: 'tuxedo', colour: '#16161c', strength: 0.92 }] }, value: 1.2, label: 'Tuxedo' }]]),
      L('wag', 'Fin colour', [['n', 'Plain', 0, { freq: 6 }], ['W', 'Wagtail', 1, { freq: 1.5, visual: { finColour: '#15161c' }, value: 1.15, label: 'Wagtail' }]]),
    ],
    rules: [
      { morph: 'mickey', when: { spot: 'M' } },
      { morph: 'red', when: { colour: 'R' } },
      { morph: 'sunset', when: { colour: 'S' } },
      { morph: 'blue_wag', when: {} },
    ],
  },
  molly: {
    loci: [
      L('colour', 'Colour', [['B', 'Black', 2], ['D', 'Dalmatian', 1], ['g', 'Gold dust', 0]]),
      L('sail', 'Dorsal', [['n', 'Normal', 0, { freq: 6 }], ['S', 'Sailfin', 1, { freq: 1.5, visual: { dorsalSize: 1.9, dorsalSail: true }, value: 1.3, label: 'Sailfin' }]]),
      L('lyre', 'Tail', [['n', 'Normal', 0, { freq: 7 }], ['L', 'Lyretail', 1, { freq: 1, visual: { caudal: 'lyre', caudalSize: 1.3 }, value: 1.25, label: 'Lyretail' }]]),
    ],
    rules: [
      { morph: 'black', when: { colour: 'B' } },
      { morph: 'dalmatian', when: { colour: 'D' } },
      { morph: 'gold', when: {} },
    ],
  },
  neon_tetra: {
    loci: [
      L('colour', 'Colour', [['S', 'Standard', 1], ['g', 'Gold', 0]]),
      L('fins', 'Fins', [['n', 'Normal', 1, { freq: 14 }], ['l', 'Longfin', 0, { freq: 1, visual: { finSize: 1.7, caudal: 'veil' }, value: 1.4, label: 'Longfin' }]]),
      ALBINO,
    ],
    rules: [
      { morph: 'standard', when: { colour: 'S' } },
      { morph: 'gold', when: {} },
    ],
  },
  zebra_danio: {
    loci: [
      L('pattern', 'Pattern', [['S', 'Stripes', 1], ['l', 'Leopard', 0]]),
      L('fins', 'Fins', [['F', 'Long fins', 1], ['s', 'Short fins', 0]]),
      L('gold', 'Colour', [['N', 'Normal', 1, { freq: 8 }], ['g', 'Golden', 0, { freq: 1.5, visual: { melanism: -0.7 }, value: 1.2, label: 'Golden' }]]),
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
    loci: [
      L('pigment', 'Pigment', [['P', 'Normal', 1, { freq: 10 }], ['a', 'Albino', 0, { freq: 1, visual: { albino: true } }]]),
      L('fins', 'Fins', [['n', 'Normal', 1, { freq: 10 }], ['l', 'Longfin', 0, { freq: 1.2, visual: { finSize: 1.8, caudal: 'veil' }, value: 1.5, label: 'Longfin' }]]),
    ],
    rules: [
      { morph: 'albino', when: { pigment: 'a' } },
      { morph: 'bronze', when: {} },
    ],
  },
  bristlenose: {
    loci: [
      L('pigment', 'Pigment', [['P', 'Normal', 1, { freq: 10 }], ['a', 'Albino', 0, { freq: 1, visual: { albino: true } }]]),
      L('red', 'Red', [['N', 'Normal', 1, { freq: 10 }], ['r', 'Super red', 0, { freq: 1 }]]),
      L('fins', 'Fins', [['n', 'Normal', 0, { freq: 8 }], ['L', 'Longfin', 1, { freq: 1, visual: { finSize: 2, caudal: 'veil' }, value: 1.6, label: 'Longfin' }]]),
    ],
    rules: [
      { morph: 'super_red', when: { red: 'r' } },
      { morph: 'albino', when: { pigment: 'a' } },
      { morph: 'common', when: {} },
    ],
  },
  fancy_goldfish: {
    loci: [
      L('colour', 'Colour', [['O', 'Red', 3], ['K', 'Black', 2], ['C', 'Calico', 1], ['w', 'Red cap', 0]]),
      L('tail', 'Tail', [['F', 'Fantail', 1, { freq: 5 }], ['v', 'Veiltail', 0, { freq: 1.5, visual: { caudalSize: 1.45, caudal: 'veil' }, value: 1.3, label: 'Veiltail' }]]),
      L('eyes', 'Eyes', [['N', 'Normal', 1, { freq: 6 }], ['t', 'Telescope', 0, { freq: 1, visual: { telescope: true }, value: 1.15, label: 'Telescope' }]]),
    ],
    rules: [
      { morph: 'oranda', when: { colour: 'O' } },
      { morph: 'moor', when: { colour: 'K' } },
      { morph: 'calico', when: { colour: 'C' } },
      { morph: 'redcap', when: {} },
    ],
  },
};
