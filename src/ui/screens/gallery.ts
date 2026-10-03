/**
 * Developer morph gallery: paints many phenotype combinations side by side so
 * art and genetics can be checked at a glance (and by headless screenshots:
 * open the game with #gallery=<speciesId>).
 */
import type { GameController } from '../../game/GameController';
import { GENETICS } from '../../data/genetics';
import { SPECIES, getSpecies } from '../../data/species';
import { genotypeForMorph } from '../../sim/genetics';
import { phenotypeFrom, type PhenotypeInput } from '../../sim/phenotype';
import { Rng } from '../../core/rng';
import { paintFishPortrait, paintFishSheet, SWIM_FRAMES } from '../../render/art/fishPainter';
import type { Action } from '../../input/input';
import type { Screen } from '../ui';
import { h } from '../dom';

export interface GalleryCell {
  label: string;
  input: PhenotypeInput;
}

/** Rows: each morph, then each non-default allele shown on the first morph. Columns: life stages and sexes. */
export function galleryCells(speciesId: string): GalleryCell[][] {
  const sp = getSpecies(speciesId);
  const g = GENETICS[speciesId];
  const rng = new Rng(7);
  const rows: GalleryCell[][] = [];
  const stages: Array<{ label: string; sex: 'male' | 'female'; frac: number; age: number; preg: number; ready: number }> = [
    { label: 'Male', sex: 'male', frac: 1, age: sp.maturityDays * 3, preg: 0, ready: 0 },
    { label: 'Female', sex: 'female', frac: 1, age: sp.maturityDays * 3, preg: 0, ready: 0 },
    { label: sp.breeding.method === 'livebearer' ? 'Gravid' : 'Ripe', sex: 'female', frac: 1, age: sp.maturityDays * 3, preg: sp.breeding.method === 'livebearer' ? 0.9 : 0, ready: 1 },
    { label: 'Juvenile', sex: 'male', frac: 0.5, age: sp.maturityDays * 0.5, preg: 0, ready: 0 },
    { label: 'Fry', sex: 'male', frac: 0.2, age: 2, preg: 0, ready: 0 },
  ];
  const row = (title: string, morphId: string, loci: Record<string, [string, string]>, quality = 0.6) =>
    stages.map((st, i) => ({
      label: i === 0 ? title : st.label,
      input: { speciesId, morphId, sex: st.sex, sizeFraction: st.frac, ageDays: st.age, loci, quality, health: 100, pregnancy: st.preg, breedingReadiness: st.ready, id: `${morphId}${i}${title}` },
    }));
  const baseLoci = (morphId: string) => {
    const l = genotypeForMorph(speciesId, morphId, rng);
    // Neutral background for the other loci so each row shows one trait.
    for (const locus of g?.loci ?? []) if (!g.rules.some((r) => locus.id in r.when)) l[locus.id] = [locus.alleles[0].id, locus.alleles[0].id];
    return l;
  };
  for (const m of sp.morphs) rows.push(row(m.name, m.id, baseLoci(m.id)));
  const first = sp.morphs[0].id;
  for (const locus of g?.loci ?? []) {
    if (g.rules.some((r) => locus.id in r.when)) continue;
    for (const a of locus.alleles.slice(1)) {
      const l = baseLoci(first);
      l[locus.id] = [a.id, a.id];
      rows.push(row(`${a.name} (${locus.name})`, first, l));
    }
  }
  rows.push(row('Low quality', first, baseLoci(first), 0.05));
  rows.push(row('Top quality', first, baseLoci(first), 1));
  return rows;
}

/** Paints a phenotype into a canvas element at a fixed display length. */
export function portraitCanvas(input: PhenotypeInput, length: number, scale = 1): HTMLCanvasElement {
  const img = paintFishPortrait(phenotypeFrom(input), Math.round(length * Math.max(0.35, input.sizeFraction)));
  const cv = document.createElement('canvas');
  cv.width = img.width;
  cv.height = img.height;
  cv.getContext('2d')!.putImageData(new ImageData(img.data, img.width, img.height), 0, 0);
  cv.style.width = `${img.width * scale}px`;
  cv.style.imageRendering = 'pixelated';
  return cv;
}

export class GalleryScreen implements Screen {
  el: HTMLElement;
  blocking = true;
  private idx: number;
  private body: HTMLElement;
  constructor(private c: GameController, speciesId?: string) {
    this.idx = Math.max(0, SPECIES.findIndex((s) => s.id === speciesId));
    this.body = h('div', { class: 'gallery-grid' });
    this.el = h('div', { class: 'gallery' }, this.body);
    this.render();
  }
  private render(): void {
    const sp = SPECIES[this.idx];
    this.body.innerHTML = '';
    this.body.appendChild(h('div', { class: 'gallery-head' }, `${sp.commonName} morph gallery  (Left/Right species, X close)`));
    const length = 170;
    // Animation strip: the 8 swim frames and 3 turn (yaw) frames of the first adult male.
    const first = galleryCells(sp.id)[0][0].input;
    const sheet = paintFishSheet(phenotypeFrom(first), length);
    const strip = h('div', { class: 'gallery-row' });
    sheet.frames.forEach((data, i) => {
      const cv = document.createElement('canvas');
      cv.width = sheet.width;
      cv.height = sheet.height;
      cv.getContext('2d')!.putImageData(new ImageData(data, sheet.width, sheet.height), 0, 0);
      cv.style.width = `${sheet.width * 0.4}px`;
      strip.appendChild(h('div', { class: 'gallery-cell' }, cv, h('div', { class: 'gallery-label' }, i < SWIM_FRAMES ? `swim ${i}` : `turn ${i - SWIM_FRAMES + 1}`)));
    });
    this.body.appendChild(strip);
    for (const row of galleryCells(sp.id)) {
      const r = h('div', { class: 'gallery-row' });
      for (const cell of row) r.appendChild(h('div', { class: 'gallery-cell' }, portraitCanvas(cell.input, length), h('div', { class: 'gallery-label' }, cell.label)));
      this.body.appendChild(r);
    }
  }
  handle(a: Action): boolean {
    if (a === 'left' || a === 'right') {
      this.idx = (this.idx + (a === 'left' ? -1 : 1) + SPECIES.length) % SPECIES.length;
      this.render();
      return true;
    }
    if (a === 'up' || a === 'down') {
      this.el.scrollTop += a === 'down' ? 120 : -120;
      return true;
    }
    if (a === 'back' || a === 'menu') {
      this.c.ui.remove(this);
      return true;
    }
    return true;
  }
}

export function openGallery(c: GameController, speciesId?: string): void {
  c.ui.push(new GalleryScreen(c, speciesId));
}
