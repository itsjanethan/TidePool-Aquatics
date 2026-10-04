/**
 * Reef data: corals, reef lighting, water movement and reef chemistry
 * targets. Corals are decor items (kind 'coral') that live, grow and can be
 * fragged; the numbers here drive sim/reef.ts and every explanation the UI
 * shows, so "how much light" or "how much flow" is defined once.
 *
 * Units: light as PAR (µmol photons/m²/s at the coral), water movement as a
 * 0..1 index (0.3 gentle, 0.6 moderate, 0.9 strong), alkalinity in dKH,
 * calcium and magnesium in ppm, nitrate in ppm.
 */

export type CoralGroup = 'soft' | 'lps' | 'sps';
/** Art form used by the coral renderer. */
export type CoralForm = 'zoa' | 'gsp' | 'mushroom' | 'leather' | 'hammer' | 'torch' | 'plate' | 'acro';

export interface CoralTraits {
  group: CoralGroup;
  form: CoralForm;
  /** Corals of one genus tolerate each other's stings (Euphyllia). */
  genus: string;
  /** Comfortable light at the coral, PAR. */
  par: [number, number];
  /** Comfortable water movement at the coral, 0..1. */
  flow: [number, number];
  /** Comfortable nitrate, ppm (corals need some nutrients; SPS want very little). */
  nitrate: [number, number];
  /** Alkalinity used building skeleton: dKH per day per size unit in 100 L at full growth. */
  calcify: number;
  /** Size units per day in ideal conditions. */
  growth: number;
  maxSize: number;
  /** Damage per day to neighbours in reach (sweeper tentacles, chemical warfare). */
  sting: number;
  /** Sting reach as a fraction of the tank width. */
  reach: number;
  /** 0..1 how quickly poor conditions hurt it (SPS high). */
  sensitivity: number;
  colours: { base: string; tip: string; glow: string };
  /** How a frag is taken, for the UI. */
  frag: string;
}

/** Height on the rockwork. Decor layer 0/1/2 means top / middle / sand bed for corals. */
export type Perch = 'top' | 'mid' | 'sand';
export const PERCH_LABEL: Record<Perch, string> = { top: 'top of the rockwork', mid: 'middle of the rockwork', sand: 'sand bed' };
/** Fraction of the light's PAR that reaches each height. */
export const PERCH_LIGHT: Record<Perch, number> = { top: 1, mid: 0.66, sand: 0.42 };
/** Fraction of the tank's water movement at each height. */
export const PERCH_FLOW: Record<Perch, number> = { top: 1, mid: 0.82, sand: 0.58 };

export interface ReefLightDef {
  id: string;
  name: string;
  cost: number;
  /** PAR at the top of the rockwork. */
  par: number;
  /** 0..1 how blue the light looks (actinic). */
  actinic: number;
  powerPerDay: number;
  description: string;
}

export const REEF_LIGHTS: ReefLightDef[] = [
  { id: 'standard', name: 'Standard hood light', cost: 0, par: 70, actinic: 0, powerPerDay: 0.1, description: 'The tank\'s ordinary light. Enough for fish and the hardiest soft corals low down.' },
  { id: 'reef_led', name: 'Reef LED', cost: 180, par: 260, actinic: 0.55, powerPerDay: 0.35, description: 'Blue-white reef light. Suits soft corals and LPS; SPS only near the top.' },
  { id: 'reef_led_pro', name: 'High-output reef LED', cost: 380, par: 420, actinic: 0.7, powerPerDay: 0.6, description: 'Strong enough for SPS at the top of the rockwork. Too bright up high for mushrooms and most LPS.' },
];

export interface WavemakerDef {
  level: number;
  name: string;
  cost: number;
  /** Added to the tank's water movement index. */
  flow: number;
  powerPerDay: number;
}

export const WAVEMAKERS: WavemakerDef[] = [
  { level: 0, name: 'No wavemaker', cost: 0, flow: 0, powerPerDay: 0 },
  { level: 1, name: 'Nano wavemaker', cost: 45, flow: 0.28, powerPerDay: 0.08 },
  { level: 2, name: 'Strong wavemaker', cost: 110, flow: 0.52, powerPerDay: 0.15 },
];

export const DOSER_COST = 140;

/** Natural seawater values that a salt-mix water change moves toward. */
export const SALT_MIX = { alk: 8, calcium: 420, magnesium: 1300 };
/** What reef keepers aim for. */
export const REEF_TARGETS = { alk: [7.5, 10.5] as [number, number], calcium: [390, 460] as [number, number], magnesium: [1250, 1420] as [number, number] };
/** Calcium consumed (ppm) per dKH of alkalinity used by calcifying corals (CaCO3 stoichiometry). */
export const CALCIUM_PER_DKH = 7.1;
/** Doses (per 100 L, one unit of the product each). */
export const DOSE = { alk: 1, calcium: 20, magnesium: 50 };
/** Daily alkalinity swing that stresses stony corals. */
export const ALK_SWING_LIMIT = 1.3;
/** Minimum size of a coral before a frag can be cut, and how much a frag takes. */
export const FRAG_MIN_SIZE = 0.8;
export const FRAG_SIZE = 0.25;
