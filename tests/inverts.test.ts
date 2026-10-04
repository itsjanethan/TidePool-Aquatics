import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { getSpecies } from '../src/data/species';
import { breedingConditions } from '../src/sim/breeding';
import { assessSpeciesForSetup, stressTarget } from '../src/sim/compat';
import { createFish, environmentalDamage, fishInTank } from '../src/sim/fish';
import { canEat, grazeWeight, predationWarning, tickPredation } from '../src/sim/inverts';
import { newGame } from '../src/sim/newGame';
import { summarizeAquascape } from '../src/sim/aquascape';
import { diagnoseTank } from '../src/sim/tankDiagnostics';
import { lineWarnings } from '../src/sim/orderCheck';
import type { GameState, TankState } from '../src/sim/types';
import { buildUpTo } from './helpers/world';

function game(): GameState {
  const s = newGame({ seed: 7 });
  buildUpTo(s, 5);
  s.money = 1e6;
  return s;
}
function empty(s: GameState, id: string): TankState {
  for (const f of fishInTank(s, id, true)) delete s.fish[f.id];
  return s.tanks[id];
}
const add = (s: GameState, t: TankState, sid: string, n: number, rng = new Rng(1)) =>
  Array.from({ length: n }, () => createFish(s, rng, { speciesId: sid, origin: 'dev', tankId: t.id, ageDays: getSpecies(sid).maturityDays * 1.5, sizeFraction: 1 }));

describe('Invertebrates', () => {
  it('fish big enough eat shrimp; snails are safe from fish; hermits only take smaller snails', () => {
    const gold = getSpecies('fancy_goldfish');
    const cherry = getSpecies('cherry_shrimp');
    const amano = getSpecies('amano_shrimp');
    const nerite = getSpecies('nerite_snail');
    expect(canEat(gold, 15, cherry, 2.5)).toBe(true);
    expect(canEat(getSpecies('german_blue_ram'), 5.5, amano, 5)).toBe(false);
    expect(canEat(gold, 15, nerite, 2.5)).toBe(false);
    const hermit = getSpecies('hermit_crab');
    expect(canEat(hermit, 2.5, getSpecies('turbo_snail'), 4)).toBe(false);
    expect(canEat(hermit, 2.5, getSpecies('turbo_snail'), 1.5)).toBe(true);
    expect(predationWarning(gold, cherry)).toMatch(/will eat Cherry Shrimp/);
  });

  it('predators really eat shrimp over time, logged, while a shrimp-only tank stays safe', () => {
    const s = game();
    const t = empty(s, 'U2');
    t.decor = [];
    add(s, t, 'fancy_goldfish', 2);
    add(s, t, 'cherry_shrimp', 10);
    const safe = empty(s, 'F1');
    add(s, safe, 'cherry_shrimp', 10);
    expect(diagnoseTank(s, t).issues.some((i) => i.id === 'predation')).toBe(true);
    const rng = new Rng(4);
    const log: string[] = [];
    for (let h = 0; h < 24 * 5; h++) {
      tickPredation(s, t, 1, rng, (x) => log.push(x));
      tickPredation(s, safe, 1, rng, (x) => log.push(x));
    }
    expect(fishInTank(s, t.id).filter((f) => f.speciesId === 'cherry_shrimp').length).toBeLessThan(10);
    expect(fishInTank(s, safe.id).length).toBe(10);
    expect(log[0]).toMatch(/ate a Cherry Shrimp/);
  });

  it('ordering shrimp into a goldfish tank warns before money is spent', () => {
    const s = game();
    const t = empty(s, 'U2');
    add(s, t, 'fancy_goldfish', 2);
    const ws = lineWarnings(s, { speciesId: 'cherry_shrimp', quantity: 10, tankId: t.id }, [{ speciesId: 'cherry_shrimp', quantity: 10, tankId: t.id }]);
    expect(ws.map((w) => w.text).join(' ')).toMatch(/eat Cherry Shrimp/);
    expect(assessSpeciesForSetup('cherry_shrimp', { litres: 200, heated: false, temperature: 20, residentSpecies: ['fancy_goldfish'] }).issues.join(' ')).toMatch(/eat/);
  });

  it('soft water erodes snail shells and fails shrimp moults, named as such', () => {
    const s = game();
    const t = s.tanks.F3; // active shrimp soil, GH about 5
    const [snail] = add(s, t, 'mystery_snail', 1);
    const [crs] = add(s, t, 'crystal_shrimp', 1);
    const env = { temperature: 22, ph: 6.3, gh: 4, ammonia: 0, nitrite: 0, nitrate: 5, oxygen: 8, litres: t.litres, stressTarget: 10, salinity: 0 };
    expect(environmentalDamage(snail, env).causes).toContain('shell erosion (water too soft)');
    expect(environmentalDamage(crs, env).causes).not.toContain('failed moult (water too soft)');
    t.water.gh = 4;
    expect(diagnoseTank(s, t).issues.some((i) => i.id === 'minerals')).toBe(true);
  });

  it('a cleaner shrimp calms the fish in its tank', () => {
    const s = game();
    const t = empty(s, 'R3');
    const [clown] = add(s, t, 'clownfish', 1);
    const sc = summarizeAquascape(t);
    const before = stressTarget(clown, t, fishInTank(s, t.id), sc).total;
    add(s, t, 'cleaner_shrimp', 1);
    expect(stressTarget(clown, t, fishInTank(s, t.id), sc).total).toBeLessThan(before);
  });

  it('small inverts graze far less than a pleco; larvae that need brackish water never breed in freshwater', () => {
    const s = game();
    const t = empty(s, 'F2');
    const [amano] = add(s, t, 'amano_shrimp', 2);
    add(s, t, 'amano_shrimp', 2);
    expect(grazeWeight(amano)).toBeLessThan(0.5);
    for (const f of fishInTank(s, t.id)) f.breedingReadiness = 1;
    const rep = breedingConditions(s, t, 'amano_shrimp');
    expect(rep.factor).toBe(0);
    expect(rep.reasons.join(' ')).toMatch(/brackish/);
  });
});
