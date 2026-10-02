/**
 * Developer panel. Only reachable when DEV_ALLOWED (dev build or ?dev=1).
 * Every action marks the save as dev-touched.
 */
import type { GameController } from '../../game/GameController';
import { DEV_ALLOWED } from '../../game/GameController';
import { formatMoney } from '../../core/math';
import { SPECIES } from '../../data/species';
import { spawnCustomer } from '../../sim/customers';
import { createFish, fishInTank } from '../../sim/fish';
import { OBJECTIVES } from '../../sim/progression';
import { REP_DIMENSIONS } from '../../sim/reputation';
import type { CustomerGoal } from '../../sim/types';
import { h } from '../dom';
import type { MenuItem } from '../menu';
import type { MenuScreen } from '../ui';

let open: MenuScreen | null = null;
let tankIdx = 0;
let speciesIdx = 0;
let goalIdx = 0;
const GOALS: CustomerGoal[] = ['browse', 'buy_specific', 'advice_stocking', 'problem'];

export function toggleDevPanel(c: GameController): void {
  if (!DEV_ALLOWED) return;
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
  const todo = (label: string): MenuItem => ({ label: `${label} (Milestone 2)`, disabled: true });
  const items = (): MenuItem[] => [
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
    act('Inspect genetics (first fish)', () => {
      const f = fishInTank(s, tank().id)[0];
      if (f) void c.ui.say('Genetics', JSON.stringify({ id: f.id, species: f.speciesId, morph: f.morphId, sex: f.sex, genes: f.genes, gen: f.generation, parents: f.parents }, null, 0));
    }),
    todo('Force pregnancy'), todo('Force spawning'), todo('Create fry'), todo('Trigger mutation'),
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
    act('Unlock floor 2 flag', () => { if (!s.unlocks.floors.includes('floor2')) s.unlocks.floors.push('floor2'); }, 'Flag only: floor 2 content arrives in Milestone 3.'),
    act('Unlock marine flag', () => (s.unlocks.marine = true), 'Flag only: marine content arrives in Milestone 4.'),
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
