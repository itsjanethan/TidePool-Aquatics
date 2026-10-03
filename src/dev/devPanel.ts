/**
 * Developer panel. Only compiled into developer builds (`__DEV_TOOLS__`);
 * the public production build contains none of src/dev. Every action marks
 * the save as dev-touched.
 */
import { EXPANSIONS } from '../data/expansions';
import { buyExpansion } from '../sim/expansion';
import { hireApplicant, refreshApplicants } from '../sim/staff';
import { RETAIL_ITEMS } from '../data/retail';
import type { GameController } from '../game/GameController';
import { formatMoney } from '../core/math';
import { SPECIES } from '../data/species';
import { spawnCustomer } from '../sim/customers';
import { createFish, fishInTank, isMature } from '../sim/fish';
import { birthFry } from '../sim/breeding';
import { genotypeForMorph, morphFromGenes } from '../sim/genetics';
import { galleryCells, openGallery } from './gallery';
import { GENETICS } from '../data/genetics';
import { getSpecies } from '../data/species';
import type { FishEntity } from '../sim/types';
import { OBJECTIVES } from '../sim/progression';
import { REP_DIMENSIONS } from '../sim/reputation';
import type { CustomerGoal } from '../sim/types';
import { h } from '../ui/dom';
import type { MenuItem } from '../ui/menu';
import type { MenuScreen } from '../ui/ui';

let open: MenuScreen | null = null;
let tankIdx = 0;
let speciesIdx = 0;
let goalIdx = 0;
let sexIdx = 0;
let stageIdx = 2;
let locusIdx = 0;
let alleleIdx = 0;
const SEXES = ['random', 'male', 'female'] as const;
const STAGES = [
  { name: 'fry', frac: 0.2, ageK: 0.05 },
  { name: 'juvenile', frac: 0.5, ageK: 0.5 },
  { name: 'adult', frac: 1, ageK: 3 },
  { name: 'gravid adult', frac: 1, ageK: 3 },
] as const;
const GOALS: CustomerGoal[] = ['browse', 'buy_specific', 'advice_stocking', 'problem', 'buy_equipment'];

export function toggleDevPanel(c: GameController): void {
  if (open) {
    c.ui.remove(open);
    open = null;
    return;
  }
  const s = c.state;
  const scene = c.game.scene.getScene('Tank') as unknown as { tankId?: string; sys: { isActive(): boolean } } | null;
  if (scene?.sys.isActive() && scene.tankId) tankIdx = Math.max(0, s.tankOrder.indexOf(scene.tankId));
  const tank = () => s.tanks[s.tankOrder[tankIdx]];
  const act = (label: string, fn: () => void, hint?: string): MenuItem => ({
    label,
    hint,
    action: () => {
      s.flags.devUsed = true;
      fn();
      c.ui.toast(`[dev] ${label}`, 'info', 1200);
      scr.refresh(items());
    },
  });
  /** First mature female/male of the chosen species in the target tank, or any pair in the tank. */
  const pair = (): [FishEntity, FishEntity] | null => {
    const all = fishInTank(s, tank().id).filter((f) => isMature(f));
    const sid = SPECIES[speciesIdx].id;
    const bySp = (id: string) => [all.find((f) => f.speciesId === id && f.sex === 'female'), all.find((f) => f.speciesId === id && f.sex === 'male')] as const;
    let [m, d] = bySp(sid);
    if (!m || !d) for (const f of all) { [m, d] = bySp(f.speciesId); if (m && d) break; }
    return m && d ? [m, d] : null;
  };
  const spawnStaged = () => {
    const sp = SPECIES[speciesIdx];
    const st = STAGES[stageIdx];
    const f = createFish(s, c.sim!.rng, { speciesId: sp.id, origin: 'dev', originDetail: 'Dev spawn', tankId: tank().id, sizeFraction: st.frac, ageDays: Math.round(sp.maturityDays * st.ageK) });
    if (SEXES[sexIdx] !== 'random') f.sex = SEXES[sexIdx] as 'male' | 'female';
    if (st.name === 'gravid adult') {
      f.sex = 'female';
      if (sp.breeding.method === 'livebearer') f.pregnancy = { daysRemaining: sp.breeding.incubationDays * 0.1, fryCount: 6 };
      else f.breedingReadiness = 1;
    }
  };
  /** Rows to pick a locus and allele and apply it (homozygous) to the chosen species in the target tank. */
  const traitSetter = (): MenuItem[] => {
    const g = GENETICS[SPECIES[speciesIdx].id];
    if (!g) return [];
    const locus = g.loci[locusIdx % g.loci.length];
    const allele = locus.alleles[alleleIdx % locus.alleles.length];
    return [
      { label: `Trait: ${locus.name}`, onLeft: () => { locusIdx = (locusIdx + g.loci.length - 1) % g.loci.length; alleleIdx = 0; scr.refresh(items()); }, onRight: () => { locusIdx = (locusIdx + 1) % g.loci.length; alleleIdx = 0; scr.refresh(items()); } },
      { label: `Allele: ${allele.name}`, onLeft: () => { alleleIdx = (alleleIdx + locus.alleles.length - 1) % locus.alleles.length; scr.refresh(items()); }, onRight: () => { alleleIdx = (alleleIdx + 1) % locus.alleles.length; scr.refresh(items()); } },
      act('Apply trait to that species in tank', () => {
        for (const f of fishInTank(s, tank().id)) {
          if (f.speciesId !== SPECIES[speciesIdx].id) continue;
          f.genes.loci[locus.id] = [allele.id, allele.id];
          f.morphId = morphFromGenes(f.speciesId, f.genes.loci) ?? f.morphId;
        }
      }),
    ];
  };
  const noPair = () => c.ui.toast('[dev] Need a mature male and female in the target tank.', 'warn');
  const items = (): MenuItem[] => [
    ...(s.flags.sandbox ? [{ label: 'Sandbox tools (floors, tanks, presets, reset)', action: () => void import('./sandboxScreen').then((m) => m.openSandboxTools(c)) } as MenuItem] : []),
    { label: 'Money', header: true },
    act('+£100', () => (s.money += 100)),
    act('+£1,000', () => (s.money += 1000)),
    act('Set money to £0', () => (s.money = 0)),
    { label: 'Time', header: true },
    act('Advance 1 hour', () => c.sim!.advance(60)),
    act('Advance 1 day', () => c.sim!.advance(1440)),
    act('Advance 1 week', () => c.sim!.advance(1440 * 7)),
    act('Skip to next opening', () => c.sim!.skipToNextMorning()),
    { label: 'Tank', header: true },
    { label: `Target: ${tank().name}`, right: `${tank().litres}L`, onLeft: () => { tankIdx = (tankIdx - 1 + s.tankOrder.length) % s.tankOrder.length; scr.refresh(items()); }, onRight: () => { tankIdx = (tankIdx + 1) % s.tankOrder.length; scr.refresh(items()); } },
    act('Instantly cycle tank', () => { const w = tank().water; w.aob = 1; w.nob = 1; w.ammonia = 0; w.nitrite = 0; }),
    act('Ammonia spike (+2 ppm)', () => (tank().water.ammonia += 2)),
    act('Nitrate +40', () => (tank().water.nitrate += 40)),
    act('pH -1', () => (tank().water.ph -= 1)),
    act('Temperature +5°C', () => (tank().water.temperature += 5)),
    act('Make tank filthy', () => { const t = tank(); t.algae = 0.8; t.glassDirt = 0.8; t.water.cloudiness = 0.5; t.water.detritus += 2; }),
    act('Trigger algae bloom', () => (tank().algae = 0.95)),
    act('Filter failure', () => (tank().filterCondition = 0)),
    act('Heater failure', () => (tank().heaterBroken = true)),
    act('Clean every tank', () => { for (const id of s.tankOrder) { const t = s.tanks[id]; t.algae = 0; t.glassDirt = 0; t.water.cloudiness = 0; t.filterCondition = 1; } }),
    { label: 'Fish', header: true },
    { label: `Species: ${SPECIES[speciesIdx].commonName}`, onLeft: () => { speciesIdx = (speciesIdx - 1 + SPECIES.length) % SPECIES.length; scr.refresh(items()); }, onRight: () => { speciesIdx = (speciesIdx + 1) % SPECIES.length; scr.refresh(items()); } },
    act('Spawn 3 in target tank', () => { for (let i = 0; i < 3; i++) createFish(s, c.sim!.rng, { speciesId: SPECIES[speciesIdx].id, origin: 'dev', originDetail: 'Dev spawn', tankId: tank().id }); }),
    act('Age tank fish +30 days', () => { for (const f of fishInTank(s, tank().id)) { f.ageDays += 30; f.sizeCm = Math.min(f.adultSizeCm, f.sizeCm + (f.adultSizeCm - f.sizeCm) * 0.6); } }),
    act('Tank fish health 20', () => { for (const f of fishInTank(s, tank().id)) f.health = 20; }),
    act('Tank fish fully healthy & fed', () => { for (const f of fishInTank(s, tank().id)) { f.health = 100; f.hunger = 0; f.stress = 0; f.shock = 0; } }),
    act('Make tank fish starving', () => { for (const f of fishInTank(s, tank().id)) f.hunger = 95; }),
    { label: 'Visual genetics', header: true },
    { label: `Sex: ${SEXES[sexIdx]}`, onLeft: () => { sexIdx = (sexIdx + SEXES.length - 1) % SEXES.length; scr.refresh(items()); }, onRight: () => { sexIdx = (sexIdx + 1) % SEXES.length; scr.refresh(items()); } },
    { label: `Stage: ${STAGES[stageIdx].name}`, onLeft: () => { stageIdx = (stageIdx + STAGES.length - 1) % STAGES.length; scr.refresh(items()); }, onRight: () => { stageIdx = (stageIdx + 1) % STAGES.length; scr.refresh(items()); } },
    act('Spawn 3 (species, sex, stage)', () => { for (let i = 0; i < 3; i++) spawnStaged(); }),
    act('Spawn morph sampler (every morph and trait, both sexes)', () => {
      const sp = SPECIES[speciesIdx];
      for (const row of galleryCells(sp.id)) {
        for (const sex of ['male', 'female'] as const) {
          const f = createFish(s, c.sim!.rng, { speciesId: sp.id, morphId: row[0].input.morphId, genes: { loci: { ...row[0].input.loci }, quality: row[0].input.quality, size: 1 }, origin: 'dev', originDetail: 'Morph sampler', tankId: tank().id, sizeFraction: 1, ageDays: sp.maturityDays * 3 });
          f.sex = sex;
        }
      }
    }, 'Adults of every morph and single-trait variant of the chosen species.'),
    act('Spawn 10 siblings from a pair (adults)', () => {
      const p = pair();
      if (!p) return noPair();
      for (const k of birthFry(s, c.sim!.rng, p[0], p[1], tank(), 10)) { k.ageDays = getSpecies(k.speciesId).maturityDays * 3; k.sizeCm = k.adultSizeCm; }
    }, 'Shows inherited variation between brothers and sisters.'),
    act('Age tank fry and juveniles +10 days', () => {
      for (const f of fishInTank(s, tank().id)) if (f.sizeCm < f.adultSizeCm * 0.95) { f.ageDays += 10; f.sizeCm += (f.adultSizeCm - f.sizeCm) * 0.35; }
    }),
    act('Randomise genes of tank fish', () => {
      for (const f of fishInTank(s, tank().id)) {
        const g = GENETICS[f.speciesId];
        if (!g) continue;
        const morph = c.sim!.rng.pick(getSpecies(f.speciesId).morphs).id;
        f.genes.loci = genotypeForMorph(f.speciesId, morph, c.sim!.rng);
        f.morphId = morphFromGenes(f.speciesId, f.genes.loci) ?? f.morphId;
      }
    }),
    ...traitSetter(),
    act('Open morph gallery', () => openGallery(c, SPECIES[speciesIdx].id)),
    act('Inspect genetics (first fish)', () => {
      const f = fishInTank(s, tank().id)[0];
      if (f) void c.ui.say('Genetics', JSON.stringify({ id: f.id, species: f.speciesId, morph: f.morphId, sex: f.sex, genes: f.genes, gen: f.generation, parents: f.parents }, null, 0));
    }),
    act('Force pregnancy / spawn (due in 1 hour)', () => {
      const p = pair();
      if (!p) return noPair();
      const [mum, dad] = p;
      const sp = getSpecies(mum.speciesId);
      const n = Math.round((sp.breeding.clutch[0] + sp.breeding.clutch[1]) / 2);
      if (sp.breeding.method === 'livebearer') mum.pregnancy = { daysRemaining: 1 / 24, fryCount: n, fatherId: dad.id };
      else (tank().broods ??= []).push({ id: `bdev${Date.now()}`, speciesId: sp.id, motherId: mum.id, fatherId: dad.id, count: n, daysLeft: 1 / 24, laidDay: Math.floor(s.minute / 1440) + 1 });
    }, 'Uses the chosen species if a pair is present, otherwise any pair in the tank.'),
    act('Create 6 fry now', () => {
      const p = pair();
      if (!p) return noPair();
      birthFry(s, c.sim!.rng, p[0], p[1], tank(), 6);
    }),
    act('Make tank fish breeding-ready', () => { for (const f of fishInTank(s, tank().id)) { f.breedingReadiness = 1; f.health = 100; f.stress = 0; f.hunger = 10; } }),
    act('Trigger mutation (first fish)', () => {
      const f = fishInTank(s, tank().id).find((x) => GENETICS[x.speciesId]);
      if (!f) return;
      const g = GENETICS[f.speciesId];
      const locus = c.sim!.rng.pick(g.loci);
      const allele = c.sim!.rng.pick(locus.alleles).id;
      f.genes.loci[locus.id] = [allele, allele];
      f.morphId = morphFromGenes(f.speciesId, f.genes.loci) ?? f.morphId;
    }, 'Sets one locus of the first fish to a random homozygous allele.'),
    { label: 'Customers', header: true },
    { label: `Goal: ${GOALS[goalIdx]}`, onLeft: () => { goalIdx = (goalIdx - 1 + GOALS.length) % GOALS.length; scr.refresh(items()); }, onRight: () => { goalIdx = (goalIdx + 1) % GOALS.length; scr.refresh(items()); } },
    act('Spawn customer with goal', () => spawnCustomer(s, c.sim!.customerCtx, { goal: GOALS[goalIdx] })),
    act('Spawn 5 random customers', () => { for (let i = 0; i < 5; i++) spawnCustomer(s, c.sim!.customerCtx); }),
    act('All customers: patience 5 min', () => { for (const cu of s.customers) cu.patienceLeft = 5; }),
    act('All customers: infinite patience', () => { for (const cu of s.customers) cu.patienceLeft = 9999; }),
    { label: 'Progression', header: true },
    act('Reputation +10 (all)', () => { for (const d of REP_DIMENSIONS) s.reputation[d] = Math.min(100, s.reputation[d] + 10); }),
    act('Reputation -10 (all)', () => { for (const d of REP_DIMENSIONS) s.reputation[d] = Math.max(0, s.reputation[d] - 10); }),
    act('Complete all goals', () => { for (const o of OBJECTIVES) s.objectives[o.id] = { done: true, doneDay: 1, progress: 1 }; }),
    act('Build next expansion (meets requirements)', () => {
      const next = EXPANSIONS.find((e) => !s.unlocks.floors.includes(e.floor));
      if (!next) return;
      s.money = Math.max(s.money, next.requires.capital + next.cost);
      s.stats.customersServed = Math.max(s.stats.customersServed, next.requires.customersServed);
      s.stats.fishBred = Math.max(s.stats.fishBred, next.requires.fishBred ?? 0);
      for (const d of REP_DIMENSIONS) s.reputation[d] = Math.max(s.reputation[d], next.requires.reputation + 3);
      for (const o of OBJECTIVES) s.objectives[o.id] = { done: true, doneDay: 1, progress: 1 };
      c.perform(buyExpansion(s, next.id));
      c.refreshWorld();
    }, 'Sets money, reputation and goals as needed, then buys the next shop level.'),
    act('Hire one of each role', () => {
      for (const r of ['sales', 'maintenance', 'stock', 'floater'] as const) {
        refreshApplicants(s, c.sim!.rng, true);
        hireApplicant(s, s.applicants.list[0].id, r);
      }
    }),
    act('Stock retail (5 of each)', () => { for (const r of RETAIL_ITEMS) s.retail[r.id] = (s.retail[r.id] ?? 0) + 5; }),
    { label: 'Close (`)', action: () => { c.ui.remove(scr); open = null; } },
  ];
  const scr = c.ui.menu({
    title: 'Developer Panel',
    body: () => h('div', { class: 'small' }, `Money ${formatMoney(s.money)} · ${s.customers.length} customers · ${Object.keys(s.fish).length} fish records · dev used: ${s.flags.devUsed}`),
    items: items(),
    className: 'dev-panel tall',
    onBack: () => { c.ui.remove(scr); open = null; },
  });
  open = scr;
  (scr as { onClose?: () => void }).onClose = () => {
    open = null;
  };
}
