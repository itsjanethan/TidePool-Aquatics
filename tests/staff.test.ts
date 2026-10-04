import { describe, expect, it } from 'vitest';
import { fishInTank } from '../src/sim/fish';
import { spawnCustomer, queueCustomers } from '../src/sim/customers';
import {
  approveProposal, dismissStaff, makeAquascapeProposal, makeStockProposal, maintenanceJobs, openProposals, practise, predictDecor, refreshApplicants, rollApplicant, wageFor,
} from '../src/sim/staff';
import { summarizeAquascape } from '../src/sim/aquascape';
import { coverPercent } from '../src/sim/habitat';
import { addDecor } from '../src/sim/tank';
import { dailyRunningCosts } from '../src/sim/economy';
import { getPersonality } from '../src/data/staff';
import { hire, world } from './helpers/world';
import type { GameState } from '../src/sim/types';

function cleanAll(s: GameState): void {
  for (const id of s.tankOrder) {
    const t = s.tanks[id];
    t.glassDirt = 0; t.algae = 0; t.water.detritus = 0; t.water.cloudiness = 0; t.filterCondition = 1;
    t.water.nitrate = 5; t.water.ammonia = 0; t.water.nitrite = 0;
    for (const f of fishInTank(s, id)) f.hunger = 10;
  }
}

function openHours(s: GameState): void {
  s.minute = Math.floor(s.minute / 1440) * 1440 + 9 * 60 + 5;
}

describe('staff', () => {
  it('applicants have skills, a personality with trade-offs and a wage that tracks skill', () => {
    const sim = world(2);
    refreshApplicants(sim.state, sim.rng, true);
    expect(sim.state.applicants.list.length).toBe(3);
    const a = rollApplicant(sim.state, sim.rng);
    const p = getPersonality(a.personality);
    expect(p.strengths.length).toBeGreaterThan(0);
    expect(p.weaknesses.length).toBeGreaterThan(0);
    expect(wageFor({ cleaning: 80, service: 80, speed: 80, knowledge: 80 }, 'steady')).toBeGreaterThan(wageFor({ cleaning: 20, service: 20, speed: 20, knowledge: 20 }, 'steady'));
  });

  it('wages are part of the daily running costs and are charged at night', () => {
    const sim = world(2);
    const s = sim.state;
    const id = hire(sim, 'maintenance');
    const wage = s.staff.find((m) => m.id === id)!.wage;
    expect(dailyRunningCosts(s).wages).toBe(wage);
    s.minute = Math.floor(s.minute / 1440) * 1440 + 20 * 60;
    const ledgerBefore = s.ledger.length;
    sim.skipToNextMorning();
    expect(s.ledger.length).toBe(ledgerBefore + 1);
    expect(s.ledger[s.ledger.length - 1].notes.join(' ') + JSON.stringify(s.ledger)).toContain('Wages');
  });

  it('maintenance staff use diagnostics: dead fish before dirty glass', () => {
    const sim = world(3);
    const s = sim.state;
    cleanAll(s);
    s.tanks.A3.glassDirt = 0.9;
    fishInTank(s, 'B2')[0].alive = false;
    const jobs = maintenanceJobs(s, 'maintenance');
    expect(jobs[0]).toMatchObject({ tankId: 'B2', fix: 'removeDead' });
    expect(jobs.some((j) => j.tankId === 'A3' && j.fix === 'glass')).toBe(true);
  });

  it('a maintenance worker walks over and really cleans the dirty tank', () => {
    const sim = world(3);
    const s = sim.state;
    openHours(s);
    cleanAll(s);
    s.tanks.A5.glassDirt = 0.9;
    hire(sim, 'maintenance', { cleaning: 90, speed: 70, knowledge: 80 });
    for (let i = 0; i < 120 && s.tanks.A5.glassDirt > 0.3; i++) {
      sim.advance(1);
      for (const id of s.tankOrder) if (id !== 'A5') s.tanks[id].glassDirt = 0;
    }
    expect(s.tanks.A5.glassDirt).toBeLessThan(0.3);
    expect(s.staff[0].stats.tasksDone).toBeGreaterThan(0);
  });

  it('sales staff serve the till when the player is away', () => {
    const sim = world(3);
    const s = sim.state;
    openHours(s);
    s.player.floor = 'ground';
    s.player.x = 4;
    s.player.y = 15;
    hire(sim, 'sales', { service: 80, knowledge: 60, speed: 60 });
    const c = spawnCustomer(s, sim.customerCtx, { goal: 'buy_specific', patience: 1 });
    c.patienceLeft = 999;
    const served = s.stats.customersServed;
    for (let i = 0; i < 300 && s.stats.customersServed === served; i++) sim.advance(1);
    expect(s.stats.customersServed).toBeGreaterThan(served);
    expect(s.staff[0].stats.sales).toBeGreaterThan(0);
    void queueCustomers;
  });

  it('stock proposals come from real supplier stock and suitable tanks, and cost nothing until approved', () => {
    const sim = world(4);
    const s = sim.state;
    s.money = 2000;
    hire(sim, 'stock', { knowledge: 95 });
    const m = s.staff[0];
    const before = s.money;
    const p = makeStockProposal(s, sim.rng, m)!;
    expect(p).toBeTruthy();
    expect(s.money).toBe(before);
    const sup = s.suppliers[p.stock!.supplierId].stock.find((x) => x.speciesId === p.stock!.speciesId)!;
    expect(sup.available).toBeGreaterThanOrEqual(p.stock!.quantity);
    expect(p.stock!.unitCost).toBe(sup.unitCost);
    expect(s.tanks[p.stock!.tankId]).toBeTruthy();
    expect(p.reason.length).toBeGreaterThan(20);
    s.proposals.push(p);
    const r = approveProposal(s, p.id);
    expect(r.ok).toBe(true);
    expect(s.orders.length).toBe(1);
    expect(s.money).toBeLessThan(before);
    expect(openProposals(s).length).toBe(0);
  });

  it('aquascape proposals predict the real effect of the decor', () => {
    const sim = world(4);
    const s = sim.state;
    s.money = 2000;
    for (const id of s.tankOrder) if (id !== 'A4') s.tanks[id].decor.push(...Array.from({ length: 6 }, (_, i) => ({ uid: `z${id}${i}`, defId: 'java_moss', x: i / 6, layer: 1 as const, flip: false, health: 1, size: 1.8 })));
    s.tanks.A4.decor = [];
    hire(sim, 'maintenance', { knowledge: 95 });
    const p = makeAquascapeProposal(s, sim.rng, s.staff[0])!;
    expect(p?.aquascape?.tankId).toBe('A4');
    const t = s.tanks[p.aquascape!.tankId];
    const predicted = predictDecor(s, t.id, p.aquascape!.defId, p.aquascape!.x, p.aquascape!.layer);
    addDecor(s, t, p.aquascape!.defId, p.aquascape!.x, p.aquascape!.layer);
    expect(predicted).toContain(`→ ${coverPercent(summarizeAquascape(t))}%`);
  });

  it('skills grow slowly with practice, faster for eager learners', () => {
    const sim = world(2);
    const s = sim.state;
    hire(sim, 'maintenance', { cleaning: 40 });
    const m = s.staff[0];
    m.personality = 'steady';
    for (let i = 0; i < 20; i++) practise(m, 'cleaning');
    const steady = m.skills.cleaning - 40;
    expect(steady).toBeGreaterThan(0);
    expect(steady).toBeLessThan(2);
    m.skills.cleaning = 40;
    m.personality = 'eager';
    for (let i = 0; i < 20; i++) practise(m, 'cleaning');
    expect(m.skills.cleaning - 40).toBeGreaterThan(steady);
  });

  it('dismissal pays a final day and removes them', () => {
    const sim = world(2);
    const s = sim.state;
    const id = hire(sim, 'floater');
    const money = s.money;
    expect(dismissStaff(s, id).ok).toBe(true);
    expect(s.staff.length).toBe(0);
    expect(s.money).toBeLessThan(money);
  });

  it('staff go home after hours and come back in the morning', () => {
    const sim = world(2);
    const s = sim.state;
    hire(sim, 'floater');
    s.minute = Math.floor(s.minute / 1440) * 1440 + 18 * 60;
    sim.advance(120);
    expect(s.staff[0].task?.kind).toBe('break');
    sim.skipToNextMorning();
    sim.advance(10);
    expect(s.staff[0].task?.kind).not.toBe('break');
  });
});

describe('staff across floors and saves', () => {
  it('a maintenance worker takes the stairs to fix an upstairs tank', async () => {
    const sim = world(6, 2);
    const s = sim.state;
    s.minute = Math.floor(s.minute / 1440) * 1440 + 9 * 60 + 5;
    for (const id of s.tankOrder) { const t = s.tanks[id]; t.glassDirt = 0; t.algae = 0; t.water.detritus = 0; t.filterCondition = 1; t.water.nitrate = 5; t.water.ammonia = 0; t.water.nitrite = 0; }
    for (const f of Object.values(s.fish)) f.hunger = 5;
    s.tanks.U2.glassDirt = 0.9;
    hire(sim, 'maintenance', { cleaning: 90, speed: 80, knowledge: 90 });
    let wentUp = false;
    for (let i = 0; i < 200 && s.tanks.U2.glassDirt > 0.3; i++) {
      sim.advance(1);
      for (const f of Object.values(s.fish)) f.hunger = 5;
      if (s.staff[0].floor === 'upstairs') wentUp = true;
    }
    expect(wentUp).toBe(true);
    expect(s.tanks.U2.glassDirt).toBeLessThan(0.3);
  });

  it('staff kept to one floor only take jobs there', async () => {
    const { setStaffArea } = await import('../src/sim/staff');
    const sim = world(6, 2);
    const s = sim.state;
    const id = hire(sim, 'maintenance');
    expect(setStaffArea(s, id, 'upstairs').ok).toBe(true);
    fishInTank(s, 'A1')[0].alive = false;
    const jobs = maintenanceJobs(s, 'maintenance', new Set(), 'upstairs');
    expect(jobs.every((j) => j.tankId.startsWith('U'))).toBe(true);
  });

  it('staff, their skills and open suggestions survive save and load', async () => {
    const { serialize, deserialize } = await import('../src/sim/save');
    const sim = world(6, 2);
    const s = sim.state;
    s.money = 3000;
    hire(sim, 'stock', { knowledge: 80 });
    hire(sim, 'sales', { service: 70 });
    s.staff[0].floor = 'upstairs';
    s.staff[0].skills.cleaning = 47.5;
    const p = makeStockProposal(s, sim.rng, s.staff[0]);
    if (p) s.proposals.push(p);
    const back = deserialize(JSON.parse(JSON.stringify(serialize(s, 'slot1'))));
    expect(back.staff.map((m) => m.name)).toEqual(s.staff.map((m) => m.name));
    expect(back.staff[0].floor).toBe('upstairs');
    expect(back.staff[0].skills.cleaning).toBe(47.5);
    expect(back.staff[0].task).toBeNull();
    expect(back.proposals.length).toBe(s.proposals.length);
  });

  it('knowledge changes recommendation quality (seeded)', () => {
    let goodSmart = 0;
    let goodNovice = 0;
    let madeSmart = 0;
    let madeNovice = 0;
    for (let seed = 1; seed <= 24; seed++) {
      for (const [k, add] of [[95, (n: number) => { goodSmart += n; madeSmart++; }], [10, (n: number) => { goodNovice += n; madeNovice++; }]] as const) {
        const sim = world(seed, 2);
        const s = sim.state;
        s.money = 5000;
        hire(sim, 'stock', { knowledge: k });
        const p = makeStockProposal(s, sim.rng, s.staff[0]);
        if (p) add(p.warnings.length === 0 ? 1 : 0);
      }
    }
    expect(goodSmart / madeSmart).toBeGreaterThanOrEqual(goodNovice / Math.max(1, madeNovice));
    // Most suggestions from a knowledgeable buyer come with no warnings at all.
    expect(madeSmart).toBeGreaterThan(8);
    expect(goodSmart / madeSmart).toBeGreaterThanOrEqual(0.75);
  });

  it('staff never spend money without approval', () => {
    const sim = world(9, 4);
    const s = sim.state;
    s.money = 5000;
    for (const r of ['sales', 'maintenance', 'stock', 'floater'] as const) hire(sim, r, { knowledge: 70 });
    s.minute = Math.floor(s.minute / 1440) * 1440 + 9 * 60;
    const orders = s.orders.length;
    const decor = s.tankOrder.reduce((n, id) => n + s.tanks[id].decor.length, 0);
    sim.advance(9 * 60);
    expect(s.orders.length).toBe(orders);
    expect(s.tankOrder.reduce((n, id) => n + s.tanks[id].decor.length, 0)).toBe(decor);
    expect(s.proposals.length).toBeGreaterThan(0);
    expect(s.ledger.length === 0 ? s.today.notes.join(' ') : '').not.toMatch(/Order from|for Tank/);
  });
});
