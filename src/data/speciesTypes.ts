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
export type BodyShape = 'slender' | 'torpedo' | 'deep' | 'livebearer' | 'catfish' | 'pleco' | 'goldfish'
  /** Invertebrates: drawn and animated by the critter renderer, not the fish painter. */
  | 'shrimp' | 'snail' | 'crab'
  /** Land animals (vivarium floor), also drawn by the critter renderer. */
  | 'frog' | 'gecko' | 'spider';
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
  | 'speckle'
  /** Snakeskin reticulation over the body (cobra guppies). */
  | 'cobra'
  /** Dark rear half of the body (tuxedo). */
  | 'tuxedo'
  /** Black fins (wagtail). */
  | 'wag'
  /** Body colour graded toward the accent at the rear (sunset). */
  | 'gradient'
  /** Thin iridescent lateral line. */
  | 'lateral'
  /** Large dark blotches (bronze cory flank, dalmatian). */
  | 'blotch'
  /** Clownfish white bands; 'clown_edge' is the slightly wider black outline drawn first. */
  | 'clown'
  | 'clown_edge'
  /** Three bold vertical bars: through the eye, front and rear of the body. */
  | 'bands';

/** Caudal (tail) fin shapes the renderer can draw. */
export type CaudalShape = 'fork' | 'round' | 'fan' | 'delta' | 'veil' | 'sword' | 'double_sword' | 'lyre' | 'twin' | 'spade';

/** A pattern drawn on the fish. Multiple layers stack in order. */
export interface PatternLayer {
  type: PatternType;
  colour: string;
  /** Where it applies (default body). */
  region?: 'body' | 'fins' | 'tail' | 'all';
  /** 0..1 opacity / strength (default 1). */
  strength?: number;
}

/**
 * Visual effect of an expressed allele or a morph. Everything optional;
 * the renderer combines species defaults, morph, alleles and individual
 * variation into a Phenotype (src/sim/phenotype.ts).
 */
export interface VisualMod {
  albino?: boolean;
  /** 0..1 metallic scale sheen. */
  metallic?: number;
  /** 0..1 extra dark pigment. */
  melanism?: number;
  caudal?: CaudalShape;
  /** Multiplier on tail length/height. */
  caudalSize?: number;
  /** Multiplier on dorsal fin height; 'sail' style via dorsalSail. */
  dorsalSize?: number;
  dorsalSail?: boolean;
  /** Multiplier on all other fins (long-fin varieties). */
  finSize?: number;
  /** Extra pattern layers. */
  patterns?: PatternLayer[];
  /** Replace the fin colour. */
  finColour?: string;
  /** Head growth (oranda wen). */
  wen?: boolean;
  /** Telescope eyes. */
  telescope?: boolean;
  /** Iris colour. */
  iris?: string;
  /** Only shown by mature males (e.g. guppy body colour). */
  maleOnly?: boolean;
}

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
  /** Extra visual traits always shown by this morph. */
  visual?: VisualMod;
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

/**
 * Habitat needs in player-facing numbers. Diagnostics, stress and advice all
 * read these, so "how much is enough" is defined once.
 */
export interface HabitatNeeds {
  /** Recommended hiding cover for the tank, 0..1 (shown as %). */
  cover: number;
  /** Cave slots each adult of this species wants (bristlenose 1). */
  caves?: number;
  /** Minimum open swimming space, 0..1. */
  openSpace?: number;
  /** Wants this substrate grain (sand-sifters). */
  substrate?: 'sand';
  /** Wants wood to rasp. */
  wood?: boolean;
}

export interface SpeciesMotion {
  /** Tail beats per second when cruising. */
  beatHz: number;
  /** 0..1 how much the fish glides between bursts (0 = steady paddling). */
  glide: number;
  /** 0..1 how quickly the fish turns around. */
  turnRate: number;
  /** 0..1 sluggishness of acceleration (goldfish heavy, danio light). */
  inertia: number;
  /** 0..1 tendency to hover in place with fins sculling. */
  hover: number;
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
  body: {
    shape: BodyShape;
    fins: FinStyle;
    heightRatio: number;
    /** Default tail shape (otherwise derived from fins). */
    caudal?: CaudalShape;
    /**
     * Anatomy details the renderer draws: adipose (small fin behind dorsal),
     * barbels, scutes (armour plates), sucker (pleco mouth), bristles
     * (male odontodes), upturned (mouth), lateral (lateral line), gonopodium.
     */
    features?: string[];
    /** Iris colour (default warm gold). */
    iris?: string;
    /** 0..1 how see-through fins are (default 0.25). */
    finClarity?: number;
  };
  /** Habitat needs (defaults derive from shyness and tags; see habitatOf). */
  habitat?: HabitatNeeds;
  /** Swimming style for the tank view; defaults derive from body shape and behaviour. */
  motion?: SpeciesMotion;
  behaviour: SpeciesBehaviour;
  description: string;
  /** Short husbandry tip shown in advice dialogue. */
  careTip: string;
  /** Sexual dimorphism in adult size (female multiplier). */
  femaleSizeMultiplier: number;
  /** Available from the starter supplier on day one. */
  starter: boolean;
  /** Shop level that unlocks this species (default 1). */
  shopLevel?: number;
  /** Word for the young (default 'fry'): 'shrimplets', 'baby snails'. */
  young?: string;
  /** Where it lives (default water). Land animals need an enclosure; amphibious ones a paludarium. */
  lives?: 'water' | 'land' | 'amphibious';
  /** Enclosure needs for land and amphibious animals (see data/terra.ts). */
  terra?: TerraNeeds;
}

/** What a land or amphibious animal needs from its enclosure, in player-facing numbers. */
export interface TerraNeeds {
  /** Comfortable relative humidity, %. */
  humidity: [number, number];
  /** Basking spot temperature it seeks, °C (reptiles); absent = no basking. */
  basking?: number;
  /** Minimum ventilation 0..1 (0.3 low, 0.5 medium, 0.8 high). */
  ventilation: number;
  /** What it eats. */
  feeder: 'fruit_flies' | 'crickets' | 'fruit_diet';
  /** Needs calcium-dusted food (bone growth). */
  calcium: boolean;
  /** Benefits from UVB lighting (calcium use). */
  uvb?: boolean;
  /** Climbs glass and branches. */
  climber: boolean;
  /** Needs a pool of water to sit in (paludarium), not just a dish. */
  pool?: boolean;
  /** Enclosure volume per adult, litres. */
  space: number;
  /** Climate label for menus. */
  climate: 'tropical' | 'arid' | 'temperate';
}
