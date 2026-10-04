/**
 * Aquascape previews: what placing (or moving) one item would do, worked out
 * by running the real placement on a copy of the game and scoring both with
 * the real `summarizeAquascape` and `tankNeeds`. Nothing here has its own
 * bonus numbers, so the explanation cannot disagree with the simulation.
 *
 * Two kinds of effect are kept apart:
 * - the aquascaping (layout) score, which customers and reputation react to;
 * - species care: whether the fish in this tank get the cover, caves, wood,
 *   sand and open water they need. A tank can score well and still suit its
 *   fish badly, and the other way round.
 */
import { getDecor } from '../data/catalog';
import { getSpecies } from '../data/species';
import { COUNT_CAP, DENSITY_SWEET_SPOT, LAYOUT_PARTS, summarizeAquascape, VARIETY_CAP, type AquascapeSummary, type LayoutParts } from './aquascape';
import { fishInTank } from './fish';
import { coverPercent, tankNeeds } from './habitat';
import { MAX_DECOR, placeDecorFromStorage, plantFromStorage } from './plants';
import { addDecor } from './tank';
import { assessCoral, perchText } from './reef';
import type { Perch } from '../data/reef';
import type { GameState } from './types';

export interface PlacementSpec {
  defId: string;
  x: number;
  layer: 0 | 1 | 2;
  /** Plant size (new plants arrive at 0.6). */
  size?: number;
  source: 'buy' | 'storage-decor' | 'storage-plant' | 'move';
  potUid?: string;
  moveUid?: string;
}

export interface ScoreLine {
  key: keyof LayoutParts;
  label: string;
  before: number;
  after: number;
  max: number;
}

export interface CareLine {
  text: string;
  /** true: helps the fish here; false: falls short or hurts. */
  good: boolean;
}

export interface ScapeExplanation {
  name: string;
  kind: string;
  /** False when the real action would refuse (full tank, wrong water). */
  allowed: boolean;
  refusal?: string;
  cost: number;
  affordable: boolean;
  /** What the item itself provides, in player numbers. */
  provides: string[];
  layoutBefore: number;
  layoutAfter: number;
  /** For young plants: the layout once grown to full size (same scoring). */
  layoutGrown?: number;
  beautyBefore: number;
  beautyAfter: number;
  /** Score components that change, largest change first. */
  changes: ScoreLine[];
  /** Caps and diminishing returns that apply. */
  limits: string[];
  /** Species-specific care for the fish in this tank (not the score). */
  care: CareLine[];
  /** Costs of this placement, such as lost swimming space. */
  tradeoffs: string[];
  /** Corals: what this spot gives the coral itself (light, flow, neighbours). */
  coral?: CoralSpot;
}

export interface CoralSpot {
  perch: Perch;
  where: string;
  par: number;
  parRange: [number, number];
  flow: number;
  flowRange: [number, number];
  /** Growth per day at this spot as a fraction of ideal (0..1). */
  growthFactor: number;
  lines: CareLine[];
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Runs the real placement on a copy of the state; returns the copied tank (or a refusal). */
function placeOnCopy(state: GameState, tankId: string, p: PlacementSpec, sizeOverride?: number): { state: GameState; ok: boolean; message: string } {
  const copy: GameState = JSON.parse(JSON.stringify(state));
  // Money and Idle Mode are reported separately; the preview shows the effect either way.
  copy.money = Math.max(copy.money, 1e9);
  delete copy.idle;
  const t = copy.tanks[tankId];
  let r: { ok: boolean; message: string };
  if (p.source === 'move' && p.moveUid) {
    const item = t.decor.find((d) => d.uid === p.moveUid);
    if (item) {
      item.x = p.x;
      item.layer = p.layer;
    }
    r = { ok: !!item, message: item ? '' : 'Item not found.' };
  } else if (p.source === 'storage-plant' && p.potUid) r = plantFromStorage(copy, t, p.potUid, p.x, p.layer);
  else if (p.source === 'storage-decor') r = placeDecorFromStorage(copy, t, p.defId, p.x, p.layer);
  else r = addDecor(copy, t, p.defId, p.x, p.layer);
  if (r.ok && sizeOverride !== undefined && p.source !== 'move') {
    const placed = t.decor[t.decor.length - 1];
    placed.size = sizeOverride;
    placed.health = 1;
  }
  return { state: copy, ok: r.ok, message: r.message };
}

export function explainPlacement(state: GameState, tankId: string, p: PlacementSpec): ScapeExplanation {
  const tank = state.tanks[tankId];
  const def = getDecor(p.defId);
  const before = summarizeAquascape(tank);
  const placed = placeOnCopy(state, tankId, p);
  const afterTank = placed.state.tanks[tankId];
  const after = placed.ok ? summarizeAquascape(afterTank) : before;
  const isPlant = def.kind === 'plant' || def.kind === 'coral';
  let layoutGrown: number | undefined;
  if (placed.ok && isPlant && p.source !== 'move') {
    const grownSize = Math.min(def.maxSize ?? 1.4, 1.2);
    const grown = placeOnCopy(state, tankId, p, grownSize);
    if (grown.ok) layoutGrown = round1(summarizeAquascape(grown.state.tanks[tankId]).layout);
  }

  const provides = describeProvides(def, before, after, p.source === 'move');
  const changes: ScoreLine[] = (Object.keys(LAYOUT_PARTS) as Array<keyof LayoutParts>)
    .map((key) => ({ key, label: LAYOUT_PARTS[key].label, before: round1(before.parts[key]), after: round1(after.parts[key]), max: LAYOUT_PARTS[key].max }))
    .filter((l) => Math.abs(l.after - l.before) >= 0.1)
    .sort((a, b) => Math.abs(b.after - b.before) - Math.abs(a.after - a.before));

  const limits = describeLimits(tank.decor.length, before, after, p.source === 'move');
  const { care, tradeoffs } = describeCare(state, tankId, before, after);

  let coral: CoralSpot | undefined;
  if (placed.ok && def.kind === 'coral') {
    const item = p.source === 'move' ? afterTank.decor.find((d) => d.uid === p.moveUid) : afterTank.decor[afterTank.decor.length - 1];
    if (item) {
      const a = assessCoral(afterTank, item);
      coral = {
        perch: a.perch,
        where: perchText(a.perch, a.onRock, p.layer),
        par: a.par,
        parRange: a.traits.par,
        flow: a.flow,
        flowRange: a.traits.flow,
        growthFactor: a.growthFactor,
        lines: a.notes.map((n) => ({ text: n.text, good: n.good })),
      };
    }
  }
  const cost = p.source === 'buy' ? def.cost : 0;
  return {
    coral,
    name: def.name,
    kind: def.kind,
    allowed: placed.ok,
    refusal: placed.ok ? undefined : placed.message,
    cost,
    affordable: state.money >= cost,
    provides,
    layoutBefore: round1(before.layout),
    layoutAfter: round1(after.layout),
    layoutGrown,
    beautyBefore: round1(before.beauty),
    beautyAfter: round1(after.beauty),
    changes,
    limits,
    care,
    tradeoffs,
  };
}

function describeProvides(def: ReturnType<typeof getDecor>, before: AquascapeSummary, after: AquascapeSummary, moving: boolean): string[] {
  if (moving) return [];
  const out: string[] = [];
  const cov = coverPercent(after) - coverPercent(before);
  if (cov > 0) out.push(`Hiding cover +${cov}% (to ${coverPercent(after)}%)`);
  else if (def.cover > 0 && coverPercent(before) >= 100) out.push('Hiding cover (tank already at 100%)');
  const slots = after.caveSlots - before.caveSlots;
  if (slots > 0) out.push(`${slots} cave space${slots > 1 ? 's' : ''} (territories, spawning)`);
  for (const what of def.provides) {
    if (what === 'wood' && !before.provides.has('wood')) out.push('Wood (plecos rasp it; tannins)');
    else if (what === 'wood') out.push('Wood (tank already has some)');
    if (what === 'rocks') out.push('Rockwork (grazing surfaces, territory edges)');
    if (what === 'live_rock') out.push('Live rock (marine biofilter and grazing)');
    if (what === 'fry_cover') out.push('Shelter for fry and eggs (breeding)');
    if (what === 'breeding_cave') out.push('Spawning cave for cave spawners');
    if (what === 'tall_plants') out.push('Tall background plant');
    if (what === 'coral') out.push('Living coral: grows, and can be fragged for sale');
  }
  const uptake = after.nutrientUptake - before.nutrientUptake;
  if (uptake > 0.05) out.push(`Absorbs about ${round1(uptake)} ppm nitrate a day (more as it grows)`);
  const ph = after.phEffect - before.phEffect;
  if (ph < -0.01) out.push('Softens and lowers pH slightly');
  if (ph > 0.01) out.push('Raises pH and hardness slightly');
  if (!out.length) out.push('Looks only: no cover, caves or water effect');
  return out;
}

function describeLimits(itemsNow: number, before: AquascapeSummary, after: AquascapeSummary, moving: boolean): string[] {
  const out: string[] = [];
  if (!moving) {
    if (before.parts.variety >= VARIETY_CAP * 6) out.push(`Variety already full marks (${VARIETY_CAP} kinds)`);
    if (itemsNow >= COUNT_CAP) out.push(`Item count already full marks (${COUNT_CAP}+ items)`);
    if (before.looksSum >= 4) out.push('Item looks already full marks');
    if (itemsNow + 1 >= MAX_DECOR) out.push(`Tank holds ${MAX_DECOR} items; this is the last space`);
  }
  if (after.density > DENSITY_SWEET_SPOT && after.density > before.density) out.push(`Past the fullness sweet spot: more items now lower Fullness (${Math.round(after.density * 100)}% full)`);
  else if (after.density < DENSITY_SWEET_SPOT && !moving) out.push(`Room to fill: Fullness peaks at about ${Math.round(DENSITY_SWEET_SPOT * 100)}% (now ${Math.round(after.density * 100)}%)`);
  if (coverPercent(before) >= 100 && coverPercent(after) >= 100) out.push('Cover is capped at 100%');
  return out;
}

function describeCare(state: GameState, tankId: string, before: AquascapeSummary, after: AquascapeSummary): { care: CareLine[]; tradeoffs: string[] } {
  const fish = fishInTank(state, tankId);
  const needs = tankNeeds(fish);
  const care: CareLine[] = [];
  const tradeoffs: string[] = [];
  const name = (sid: string) => getSpecies(sid).commonName;
  if (!fish.length) {
    care.push({ text: 'No fish here yet: this only changes the layout score.', good: true });
  }
  const covBefore = coverPercent(before);
  const covAfter = coverPercent(after);
  if (needs.coverPct > 0 && needs.coverBy.length) {
    const who = needs.coverBy[0];
    if (covAfter >= needs.coverPct && covBefore < needs.coverPct) care.push({ text: `Gives ${name(who.speciesId)} enough cover (${covAfter}% of ${needs.coverPct}% wanted)`, good: true });
    else if (covAfter < needs.coverPct && covAfter > covBefore) care.push({ text: `More cover for ${name(who.speciesId)}: ${covAfter}% of ${needs.coverPct}% wanted`, good: true });
    else if (covAfter >= needs.coverPct && covAfter > covBefore) care.push({ text: `Cover already enough for these fish (${needs.coverPct}% wanted)`, good: true });
  }
  if (needs.caveSlots > 0) {
    const names = needs.caveBy.map((c) => name(c.speciesId)).join(', ');
    if (after.caveSlots > before.caveSlots) {
      care.push(
        before.caveSlots >= needs.caveSlots
          ? { text: `Caves already enough (${needs.caveSlots} needed by ${names})`, good: true }
          : { text: `Caves for ${names}: ${Math.min(after.caveSlots, needs.caveSlots)} of ${needs.caveSlots} needed`, good: true },
      );
    }
  }
  for (const sid of needs.woodBy) if (after.provides.has('wood') && !before.provides.has('wood')) care.push({ text: `${name(sid)} needs wood: provided`, good: true });
  for (const sid of needs.sandBy) if (!after.provides.has('sand')) care.push({ text: `${name(sid)} still needs a sand substrate (decor cannot give that)`, good: false });
  if (needs.openSpace > 0 && Math.round(after.openSpace * 100) < Math.round(before.openSpace * 100)) {
    const pctAfter = Math.round(after.openSpace * 100);
    const want = Math.round(needs.openSpace * 100);
    const line = `Open swimming space ${Math.round(before.openSpace * 100)}% → ${pctAfter}% (${needs.openBy.map(name).join(', ')} want ${want}%+)`;
    if (after.openSpace < needs.openSpace) {
      care.push({ text: `Too little open water for ${needs.openBy.map(name).join(', ')}: ${pctAfter}% of ${want}% wanted`, good: false });
      tradeoffs.push(line);
    } else tradeoffs.push(line);
  } else if (Math.round(after.openSpace * 100) < Math.round(before.openSpace * 100)) {
    tradeoffs.push(`Open swimming space ${Math.round(before.openSpace * 100)}% → ${Math.round(after.openSpace * 100)}%`);
  }
  if (!care.length && fish.length) {
    // Nothing this item changes for the fish: say where their needs stand.
    const status: string[] = [];
    if (needs.coverPct > 0) status.push(`cover ${covAfter}% of ${needs.coverPct}%`);
    if (needs.caveSlots > 0) status.push(`caves ${after.caveSlots} of ${needs.caveSlots}`);
    if (needs.openSpace > 0) status.push(`open water ${Math.round(after.openSpace * 100)}% of ${Math.round(needs.openSpace * 100)}%`);
    const short = (needs.coverPct > covAfter) || (needs.caveSlots > after.caveSlots) || (needs.openSpace > after.openSpace);
    care.push({ text: `No change for the fish here${status.length ? ` (${status.join(', ')})` : ''}`, good: !short });
  }
  if (after.shade > before.shade + 0.01) tradeoffs.push(`Shades the plants below (${Math.round(after.shade * 100)}% of the light blocked)`);
  return { care, tradeoffs };
}
