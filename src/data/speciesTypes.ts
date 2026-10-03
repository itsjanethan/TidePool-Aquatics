/**
 * Species definition schema. See SPECIES_SCHEMA.md for field meanings.
 * Gameplay code must read behaviour from these fields rather than
 * branching on species IDs, so new species can be added as pure data.
 */

export type WaterType = 'freshwater' | 'brackish' | 'marine';
export type Section = 'coldwater' | 'temperate' | 'tropical' | 'marine' | 'reef';
export type SwimLevel = 'top' | 'middle' | 'bottom' | 'all';
export type Social = 'solitary' | 'pairs' | 'group' | 'shoal';
export type Diet = 'omnivore' | 'herbivore' | 'carnivore';
export type BreedingMethod =
  | 'livebearer'
  | 'egg_scatterer'
  | 'adhesive_eggs'
  | 'cave_spawner'
  | 'substrate_spawner'
  | 'mouthbrooder'
  | 'bubble_nest'
  | 'pair_former';
export type Rarity = 'common' | 'uncommon' | 'rare' | 'very_rare';

/** Visual body archetype used by the procedural fish renderer. */
export type BodyShape = 'slender' | 'torpedo' | 'deep' | 'livebearer' | 'catfish' | 'pleco' | 'goldfish';
export type FinStyle = 'short' | 'fan' | 'delta' | 'long' | 'sail' | 'twin';
export type PatternType =
  | 'none'
  | 'neon'
  | 'stripes'
  | 'spots'
  | 'mosaic'
  | 'bars'
  | 'tailspot'
  | 'calico'
  | 'speckle';

export interface ColourMorph {
  id: string;
  name: string;
  body: string;
  belly: string;
  fin: string;
  accent: string;
  pattern: PatternType;
  /** Female colours for sexually dimorphic species (optional). */
  female?: { body: string; belly: string; fin: string; accent: string; pattern?: PatternType };
  /** Relative chance of appearing in supplier stock. */
  weight: number;
  priceMultiplier: number;
  finStyleOverride?: FinStyle;
}

export interface SpeciesBehaviour {
  /** Cruising speed in body lengths per second (tank view). */
  speed: number;
  /** 0 = ignores conspecifics, 1 = tight school. */
  schooling: number;
  /** 0 = bold, 1 = hides constantly without cover. */
  shyness: number;
  /** 0..1 how often the fish changes intent. */
  restlessness: number;
  /** Preferred vertical band, 0 = surface, 1 = substrate. */
  depth: [number, number];
  /** Sits on substrate/hardscape when resting. */
  bottomRester: boolean;
  /** Clings to glass and hardscape to graze (plecos). */
  grazer: boolean;
  /** Sifts substrate for food (corydoras, goldfish). */
  sifter: boolean;
  /** Occasionally darts to the surface to gulp air. */
  airGulper: boolean;
  /** More active with lights off. */
  nocturnal: boolean;
  /** Chance per minute-ish to chase a tank mate (0..1). */
  chaseTendency: number;
  /** Fin nipping toward long-finned fish. */
  finNipper: boolean;
}

export interface SpeciesDef {
  id: string;
  commonName: string;
  scientificName: string;
  family: string;
  waterType: WaterType;
  section: Section;
  temperature: { min: number; max: number; ideal: number };
  ph: { min: number; max: number; ideal: number };
  /** General hardness in dGH. */
  hardness: { min: number; max: number };
  minTankLitres: number;
  /** Minimum tank length in cm (dimensions matter, not just volume). */
  minTankLengthCm: number;
  adultSizeCm: number;
  birthSizeCm: number;
  /** Logistic growth rate per in-game day toward adult size. */
  growthRate: number;
  lifespanDays: number;
  maturityDays: number;
  /** 0 peaceful .. 1 very aggressive. */
  aggression: number;
  territorial: boolean;
  social: Social;
  minGroupSize: number;
  swimLevel: SwimLevel;
  diet: Diet;
  /** Relative ammonia production per cm of fish. 1 = typical. */
  wasteFactor: number;
  plantSafe: boolean;
  breeding: {
    method: BreedingMethod;
    difficulty: number;
    notes: string;
    /** Young per brood (livebearer fry or eggs laid). */
    clutch: [number, number];
    /** Gestation (livebearers) or egg incubation, in in-game days. */
    incubationDays: number;
    /** 0..1 how much adults eat eggs and fry. */
    eggPredation: number;
    /** 0..1 survival bonus from guarding parents. */
    parentalCare: number;
    /** Extra condition that triggers spawning. */
    trigger?: 'water_change' | 'spring';
    /** Habitat needs: 'soft_water', 'cave', 'plants'. */
    needs?: string[];
  };
  /** Free-form tags used by compatibility rules (see compat.ts). */
  tags: string[];
  /** 0 hardy .. 1 delicate. Scales damage from bad water. */
  sensitivity: number;
  supplierCost: number;
  retailPrice: number;
  rarity: Rarity;
  morphs: ColourMorph[];
  nativeRegion: string;
  /** 1 beginner .. 5 expert. */
  difficulty: number;
  body: { shape: BodyShape; fins: FinStyle; heightRatio: number };
  behaviour: SpeciesBehaviour;
  description: string;
  /** Short husbandry tip shown in advice dialogue. */
  careTip: string;
  /** Sexual dimorphism in adult size (female multiplier). */
  femaleSizeMultiplier: number;
  /** Available from the starter supplier on day one. */
  starter: boolean;
}
