/**
 * PhenotypeSystem: turns a persistent FishEntity (species, morph, genotype,
 * sex, age, size, pregnancy, health, quality) into a plain visual
 * description the renderer paints. Pure and deterministic: the same fish in
 * the same state always gives the same phenotype, so textures can be cached.
 *
 * Layers combined, in order:
 *   species defaults -> morph colours/visual -> female colours (by maturity)
 *   -> expressed alleles (albino, metallic, fins, patterns...) -> individual
 *   variation (seeded by fish id, scaled by heritable quality) -> life stage
 *   (fry/juvenile colour and fin development) -> condition (gravid, health).
 */
import { clamp } from '../core/math';
import { getSpecies } from '../data/species';
import type { BodyShape, CaudalShape, FinStyle, PatternLayer, SpeciesDef, VisualMod } from '../data/speciesTypes';
import { shownTraits } from './genetics';
import type { FishEntity, Sex } from './types';

export type RGB = [number, number, number];

export interface Phenotype {
  speciesId: string;
  shape: BodyShape;
  male: boolean;
  /** Body depth / body length. */
  heightRatio: number;
  caudal: CaudalShape;
  /** Multipliers around 1 (species default). */
  caudalSize: number;
  dorsalSize: number;
  dorsalSail: boolean;
  finSize: number;
  /** 0 opaque .. 1 glass-clear fin membranes. */
  finClarity: number;
  /** 0 opaque body .. ~0.4 see-through (fry). */
  bodyClarity: number;
  back: RGB;
  body: RGB;
  belly: RGB;
  fin: RGB;
  accent: RGB;
  iris: RGB;
  patterns: Array<{ type: PatternLayer['type']; colour: RGB; region: NonNullable<PatternLayer['region']>; strength: number }>;
  metallic: number;
  albino: boolean;
  wen: boolean;
  telescope: boolean;
  features: string[];
  /** 0 fry .. 1 fully developed colours and fins. */
  maturity: number;
  fry: boolean;
  /** 0..1 livebearer pregnancy fullness. */
  gravid: number;
  /** 0..1 egg-laden female roundness. */
  plump: number;
  /** 0..1, low = clamped fins and faded colour. */
  condition: number;
  /** Small integer that varies pattern placement and proportions between individuals. */
  variant: number;
}

const DEFAULT_CAUDAL: Record<FinStyle, CaudalShape> = { short: 'fork', fan: 'fan', delta: 'delta', long: 'veil', sail: 'round', twin: 'twin' };

export function hexRgb(hex: string): RGB {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const lerpRgb = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const lum = (c: RGB) => 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];

function saturate(c: RGB, k: number): RGB {
  const l = lum(c);
  return [clamp(l + (c[0] - l) * k, 0, 255), clamp(l + (c[1] - l) * k, 0, 255), clamp(l + (c[2] - l) * k, 0, 255)];
}

function brighten(c: RGB, k: number): RGB {
  return k >= 1 ? lerpRgb(c, [255, 255, 255], Math.min(1, k - 1)) : lerpRgb([0, 0, 0], c, Math.max(0, k));
}

/** Albinism removes dark melanin but keeps red/yellow pigment. */
function albinoColour(c: RGB): RGB {
  const warm = clamp((c[0] - c[2]) / 160, 0, 1) * clamp(lum(c) / 140, 0.3, 1);
  const pale: RGB = [246, 224, 212];
  return lerpRgb(pale, brighten(c, 1.15), warm * 0.85);
}

/** Melanism > 0 darkens; < 0 (golden) lifts dark pigment toward warm gold. */
function melanise(c: RGB, m: number): RGB {
  if (m > 0) return lerpRgb(c, [22, 20, 26], m * 0.75);
  const gold: RGB = [232, 200, 120];
  const dark = 1 - lum(c) / 255;
  return lerpRgb(c, gold, -m * dark);
}

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export interface PhenotypeInput {
  speciesId: string;
  morphId: string;
  sex: Sex;
  /** Size / adult size. */
  sizeFraction: number;
  ageDays: number;
  loci: Record<string, [string, string]>;
  quality: number;
  health: number;
  /** 0..1 pregnancy progress (livebearers). */
  pregnancy: number;
  breedingReadiness: number;
  /** Stable per-fish seed (fish id). */
  id: string;
}

export function phenotypeInput(f: FishEntity): PhenotypeInput {
  const sp = getSpecies(f.speciesId);
  const preg = f.pregnancy ? clamp(1 - f.pregnancy.daysRemaining / Math.max(1, sp.breeding.incubationDays), 0, 1) : 0;
  return {
    speciesId: f.speciesId,
    morphId: f.morphId,
    sex: f.sex,
    sizeFraction: f.sizeCm / f.adultSizeCm,
    ageDays: f.ageDays,
    loci: f.genes.loci,
    quality: f.genes.quality,
    health: f.health,
    pregnancy: preg,
    breedingReadiness: f.breedingReadiness,
    id: f.id,
  };
}

export function phenotypeOf(f: FishEntity): Phenotype {
  return phenotypeFrom(phenotypeInput(f), f);
}

/** Core: also usable for previews (gallery) without a FishEntity. */
export function phenotypeFrom(inp: PhenotypeInput, fishForTraits?: FishEntity): Phenotype {
  const sp: SpeciesDef = getSpecies(inp.speciesId);
  const morph = sp.morphs.find((m) => m.id === inp.morphId) ?? sp.morphs[0];
  const seed = hashString(inp.id);
  const variant = seed % 8;
  const jitter = (k: number) => (((seed >>> (k * 3)) % 1000) / 1000 - 0.5) * 2; // -1..1, stable per fish

  const maturity = clamp((inp.sizeFraction - 0.28) / 0.47, 0, 1);
  const fry = inp.sizeFraction < 0.3;
  const adultMale = inp.sex === 'male' && inp.ageDays >= sp.maturityDays;
  const livebearer = sp.breeding.method === 'livebearer';

  // Colours: male morph colours, female overrides fade in with maturity.
  const female = inp.sex === 'female' && morph.female ? { ...morph, ...morph.female } : morph;
  const femaleT = inp.sex === 'female' ? 1 : livebearer ? 1 - maturity : 0; // juvenile livebearers look female
  const pick = (key: 'body' | 'belly' | 'fin' | 'accent') => lerpRgb(hexRgb(morph[key]), hexRgb(female[key]), morph.female ? femaleT : 0);
  let body = pick('body');
  let belly = pick('belly');
  let fin = pick('fin');
  let accent = pick('accent');
  const basePattern = (inp.sex === 'female' && morph.female?.pattern) || morph.pattern;

  // Visual mods: morph then expressed alleles.
  const mods: Array<{ v: VisualMod; w: number }> = [];
  if (morph.visual) mods.push({ v: morph.visual, w: 1 });
  const traits = fishForTraits
    ? shownTraits(fishForTraits)
    : shownTraits({ speciesId: inp.speciesId, sex: inp.sex, ageDays: inp.ageDays, genes: { loci: inp.loci, quality: inp.quality, size: 1 } } as FishEntity);
  for (const t of traits) if (t.allele.visual) mods.push({ v: t.allele.visual, w: t.weight });

  let caudal: CaudalShape = sp.body.caudal ?? DEFAULT_CAUDAL[morph.finStyleOverride ?? sp.body.fins];
  let caudalSize = 1;
  let dorsalSize = sp.body.fins === 'sail' ? 1.4 : 1;
  let dorsalSail = sp.body.fins === 'sail';
  let finSize = morph.finStyleOverride === 'long' ? 1.6 : 1;
  let metallic = 0;
  let melanism = 0;
  let albino = false;
  let wen = false;
  let telescope = false;
  let iris = hexRgb(sp.body.iris ?? '#d6b878');
  const patterns: Phenotype['patterns'] = [];
  if (basePattern && basePattern !== 'none') {
    const region = basePattern === 'mosaic' ? 'tail' : basePattern === 'tailspot' ? 'body' : 'body';
    patterns.push({ type: basePattern, colour: accent, region, strength: 1 });
  }
  for (const { v, w } of mods) {
    if (v.maleOnly && !adultMale) continue;
    if (v.caudal && w >= 0.5) caudal = v.caudal;
    if (v.caudalSize) caudalSize *= 1 + (v.caudalSize - 1) * w;
    if (v.dorsalSize) dorsalSize *= 1 + (v.dorsalSize - 1) * w;
    if (v.dorsalSail && w >= 0.5) dorsalSail = true;
    if (v.finSize) finSize *= 1 + (v.finSize - 1) * w;
    if (v.metallic) metallic += v.metallic * w;
    if (v.melanism) melanism += v.melanism * w;
    if (v.albino && w >= 0.5) albino = true;
    if (v.wen) wen = true;
    if (v.telescope) telescope = true;
    if (v.iris) iris = hexRgb(v.iris);
    if (v.finColour) fin = lerpRgb(fin, hexRgb(v.finColour), w);
    for (const p of v.patterns ?? []) patterns.push({ type: p.type, colour: hexRgb(p.colour), region: p.region ?? 'body', strength: (p.strength ?? 1) * w });
  }
  // Female livebearers do not grow the male's showy fins.
  if (livebearer && !adultMale) {
    if (caudal === 'delta' || caudal === 'veil' || caudal === 'double_sword' || caudal === 'sword' || caudal === 'lyre') caudal = 'round';
    caudalSize = Math.min(caudalSize, 0.65);
    dorsalSize = Math.min(dorsalSize, dorsalSail ? 1.2 : 1);
    if (inp.sex === 'female') dorsalSail = dorsalSail && sp.body.fins === 'sail';
  }

  // Individual variation, scaled by heritable quality.
  const q = clamp(inp.quality, 0, 1);
  const sat = 0.82 + 0.32 * q + jitter(1) * 0.05;
  const lit = 1 + jitter(2) * 0.05;
  const finQ = 0.88 + 0.22 * q + jitter(3) * 0.04;
  body = brighten(saturate(body, sat), lit);
  fin = saturate(fin, sat * 1.05);
  accent = saturate(accent, sat * 1.05);
  for (const p of patterns) p.colour = saturate(p.colour, sat);

  if (melanism) {
    body = melanise(body, melanism);
    belly = melanise(belly, melanism * 0.5);
    fin = melanise(fin, melanism * 0.6);
    for (const p of patterns) if (melanism < 0) p.colour = melanise(p.colour, melanism);
  }
  if (albino) {
    body = albinoColour(body);
    belly = albinoColour(belly);
    fin = albinoColour(fin);
    accent = albinoColour(accent);
    for (const p of patterns) p.colour = albinoColour(p.colour);
    iris = [214, 52, 60];
  }

  // Life stage: fry are translucent and plain; colour and fins develop with growth.
  const neutral: RGB = [176, 180, 168];
  const dev = 0.25 + 0.75 * maturity;
  body = lerpRgb(lerpRgb(neutral, body, 0.45), body, maturity);
  fin = lerpRgb(lerpRgb([200, 204, 196], fin, 0.25), fin, maturity);
  accent = lerpRgb(lerpRgb(neutral, accent, 0.5), accent, maturity);
  for (const p of patterns) p.strength *= dev;
  metallic *= maturity;
  const growFins = (x: number) => (1 + (x - 1) * maturity) * (0.75 + 0.25 * maturity);
  caudalSize = growFins(caudalSize) * finQ;
  dorsalSize = growFins(dorsalSize) * (0.94 + 0.12 * q);
  finSize = growFins(finSize) * finQ;
  if (fry && caudal !== 'fork') caudal = 'round';

  // Condition.
  const condition = clamp(inp.health / 100, 0, 1);
  if (condition < 0.5) {
    const fade = (0.5 - condition) * 0.8;
    body = lerpRgb(body, [200, 200, 196], fade);
    fin = lerpRgb(fin, [200, 200, 196], fade);
    caudalSize *= 0.85;
    finSize *= 0.85;
  }
  const back = brighten(body, 0.62 - 0.08 * metallic);

  const femaleShape = inp.sex === 'female' && inp.ageDays >= sp.maturityDays;
  const heightRatio = sp.body.heightRatio * (1 + jitter(4) * 0.04) * (femaleShape && sp.body.shape !== 'pleco' ? 1.06 : 1) * (fry ? 0.9 : 1);
  const plump = femaleShape && !livebearer ? clamp((inp.breedingReadiness - 0.4) / 0.6, 0, 1) * 0.8 : 0;

  return {
    speciesId: sp.id,
    shape: sp.body.shape,
    male: inp.sex === 'male',
    heightRatio,
    caudal,
    caudalSize,
    dorsalSize,
    dorsalSail,
    finSize,
    finClarity: clamp((sp.body.finClarity ?? 0.25) + (1 - maturity) * 0.4, 0, 0.9),
    bodyClarity: fry ? 0.35 : maturity < 0.3 ? 0.15 : 0,
    back,
    body,
    belly,
    fin,
    accent,
    iris,
    patterns,
    metallic: clamp(metallic, 0, 1),
    albino,
    wen,
    telescope,
    features: [...(sp.body.features ?? []), ...(adultMale && livebearer ? ['gonopodium'] : [])],
    maturity,
    fry,
    gravid: inp.pregnancy,
    plump,
    condition,
    variant,
  };
}

/**
 * Cache key: phenotypes that would paint identically share a texture.
 * Continuous values are quantised so a growing fish only regenerates its
 * texture a handful of times over its life.
 */
export function phenotypeKey(p: Phenotype): string {
  const q = (v: number, steps: number) => Math.round(v * steps);
  const c = (rgb: RGB) => rgb.map((v) => Math.round(v / 8)).join('.');
  return [
    p.speciesId, p.shape, p.male ? 'm' : 'f', p.caudal, q(p.caudalSize, 10), q(p.dorsalSize, 10), p.dorsalSail ? 1 : 0, q(p.finSize, 10),
    q(p.finClarity, 5), q(p.bodyClarity, 5), c(p.back), c(p.body), c(p.belly), c(p.fin), c(p.accent), c(p.iris),
    p.patterns.map((x) => `${x.type}:${c(x.colour)}:${x.region}:${q(x.strength, 4)}`).join(','),
    q(p.metallic, 4), p.albino ? 1 : 0, p.wen ? 1 : 0, p.telescope ? 1 : 0, p.features.join('+'),
    q(p.maturity, 5), p.fry ? 1 : 0, q(p.gravid, 4), q(p.plump, 2), q(p.heightRatio, 50), p.variant,
  ].join('|');
}
