import { describe, expect, it } from 'vitest';
import { getDecor } from '../src/data/catalog';
import { DOSE, FRAG_SIZE, PERCH_LIGHT, REEF_LIGHTS, SALT_MIX } from '../src/data/reef';
import { previewFix } from '../src/sim/preview';
import { availablePlants } from '../src/sim/plants';
import {
  assessCoral, availableFrags, coralEnv, doseReef, doseUnits, fragCoral, fragRefusal, perchOf, reefChem, setReefLight, tickReef,
} from '../src/sim/reef';
import { deserialize, serialize } from '../src/sim/save';
import { explainPlacement } from '../src/sim/scapePreview';
import { addDecor, doWaterChange } from '../src/sim/tank';
import { diagnoseTank } from '../src/sim/tankDiagnostics';
import type { DecorItem, GameState, TankState } from '../src/sim/types';
import { buildUpTo } from './helpers/world';
import { newGame } from '../src/sim/newGame';
import { plantPrice, FRAG_PRICE_KEY } from '../src/sim/customers';

function reefGame(): GameState {
  const s = newGame({ seed: 5 });
  buildUpTo(s, 5);
  s.money = 1e6;
  return s;
}

/** An empty marine reef tank with one rock in the middle. */
function bareReef(s: GameState, id = 'R3'): TankState {
  const t = s.tanks[id];
  t.decor = [];
  t.water.nitrate = 3;
  expect(addDecor(s, t, 'live_rock', 0.5, 1).ok).toBe(true);
  return t;
}

function coral(s: GameState, t: TankState, defId: string, x: number, layer: 0 | 1 | 2, size = 1): DecorItem {
  const r = addDecor(s, t, defId, x, layer);
  expect(r.ok, r.message).toBe(true);
  const d = t.decor[t.decor.length - 1];
  d.size = size;
  return d;
}

describe('Reef floor and corals', () => {
  it('the reef expansion opens a floor with reef systems, nano tanks and buffered shrimp soil', () => {
    const s = reefGame();
    expect(s.unlocks.floors).toContain('reef');
    expect(s.tanks.R1.waterType).toBe('marine');
    expect(s.tanks.R1.reef?.light).toBe('reef_led');
    expect(s.tanks.R2.reef?.wavemaker).toBe(2);
    expect(s.tanks.F3.substrateId).toBe('shrimp_soil');
    expect(s.tanks.F3.water.ph).toBeCloseTo(6.3, 1);
    // Starting corals sit where they are comfortable.
    for (const id of ['R1', 'R2']) for (const d of s.tanks[id].decor.filter((x) => getDecor(x.defId).kind === 'coral')) {
      expect(assessCoral(s.tanks[id], d).notes.every((n) => n.good), `${id} ${d.defId}`).toBe(true);
    }
  });

  it('height on the rockwork sets the light and flow a coral gets; with no rock it sits on the sand', () => {
    const s = reefGame();
    const t = bareReef(s);
    const top = coral(s, t, 'zoanthids', 0.5, 0);
    const mid = coral(s, t, 'zoanthids', 0.5, 1);
    const sand = coral(s, t, 'zoanthids', 0.5, 2);
    const floating = coral(s, t, 'zoanthids', 0.05, 0);
    expect(perchOf(t, top).perch).toBe('top');
    expect(perchOf(t, mid).perch).toBe('mid');
    expect(perchOf(t, sand).perch).toBe('sand');
    expect(perchOf(t, floating).perch).toBe('sand');
    const light = REEF_LIGHTS.find((l) => l.id === t.reef!.light)!;
    expect(coralEnv(t, top).par).toBe(Math.round(light.par * PERCH_LIGHT.top));
    expect(coralEnv(t, top).par).toBeGreaterThan(coralEnv(t, mid).par);
    expect(coralEnv(t, mid).par).toBeGreaterThan(coralEnv(t, sand).par);
    expect(coralEnv(t, top).flow).toBeGreaterThan(coralEnv(t, sand).flow);
  });

  it('mushrooms bleach up high under strong light; Acropora starves on the sand', () => {
    const s = reefGame();
    const t = bareReef(s);
    setReefLight(s, t, 'reef_led_pro');
    const mush = coral(s, t, 'mushroom', 0.5, 0);
    const a = assessCoral(t, mush);
    expect(a.bleachPerDay).toBeGreaterThan(0);
    expect(a.notes.find((n) => n.key === 'light')!.text).toMatch(/Too bright/);
    for (let h = 0; h < 24 * 6; h++) tickReef(s, t, 1);
    expect(mush.bleach ?? 0).toBeGreaterThan(0.3);
    setReefLight(s, t, 'standard');
    const acro = coral(s, t, 'acropora', 0.2, 2);
    expect(assessCoral(t, acro).notes.find((n) => n.key === 'light')!.text).toMatch(/Too dim/);
  });

  it('stony corals use alkalinity and calcium as they grow; soft corals barely do', () => {
    const s = reefGame();
    const hard = bareReef(s, 'R3');
    coral(s, hard, 'montipora', 0.5, 0, 1.5);
    coral(s, hard, 'acropora', 0.45, 0, 1.5);
    const soft = bareReef(s, 'R1');
    coral(s, soft, 'zoanthids', 0.5, 1, 1.5);
    coral(s, soft, 'mushroom', 0.3, 2, 1.5);
    for (let h = 0; h < 48; h++) {
      tickReef(s, hard, 1);
      tickReef(s, soft, 1);
    }
    const ch = reefChem(hard.water);
    const cs = reefChem(soft.water);
    expect(ch.alk).toBeLessThan(SALT_MIX.alk - 0.5);
    expect(ch.calcium).toBeLessThan(SALT_MIX.calcium - 3);
    expect(SALT_MIX.alk - cs.alk).toBeLessThan((SALT_MIX.alk - ch.alk) / 10);
  });

  it('low alkalinity hurts stony corals and shows up as an issue with a dosing fix', () => {
    const s = reefGame();
    const t = bareReef(s);
    const acro = coral(s, t, 'acropora', 0.5, 0, 1.2);
    const zoa = coral(s, t, 'zoanthids', 0.9, 2, 1.2);
    t.water.alk = 5.5;
    const a = assessCoral(t, acro);
    expect(a.damagePerDay).toBeGreaterThan(0);
    expect(a.notes.some((n) => n.key === 'alk')).toBe(true);
    expect(assessCoral(t, zoa).notes.some((n) => n.key === 'alk')).toBe(false);
    const issue = diagnoseTank(s, t).issues.find((i) => i.id === 'alk_low')!;
    expect(issue.severity).toBe('critical');
    expect(issue.actions.some((x) => x.fix === 'doseAlk')).toBe(true);
  });

  it('a dose raises the tank by the labelled amount, uses one measure per 100 L, and matches its preview', () => {
    const s = reefGame();
    const t = s.tanks.R1;
    s.dryGoods.reef_alk = 5;
    const before = reefChem(t.water).alk;
    const preview = previewFix(s, t.id, 'doseAlk');
    const r = doseReef(s, t, 'alk');
    expect(r.ok).toBe(true);
    expect(s.dryGoods.reef_alk).toBe(5 - doseUnits(t));
    expect(reefChem(t.water).alk).toBeCloseTo(before + (DOSE.alk * doseUnits(t) * 100) / t.litres, 6);
    expect(preview.after.alk).toBeCloseTo(Math.round(reefChem(t.water).alk * 10) / 10, 6);
    s.dryGoods.reef_alk = 0;
    expect(doseReef(s, t, 'alk').ok).toBe(false);
  });

  it('the dosing pump holds alkalinity steady from stock, and stops when the stock runs out', () => {
    const s = reefGame();
    const t = bareReef(s);
    coral(s, t, 'acropora', 0.5, 0, 1.6);
    coral(s, t, 'montipora', 0.4, 0, 1.6);
    t.reef!.doser = true;
    s.dryGoods.reef_alk = 20;
    s.dryGoods.reef_calcium = 20;
    for (let h = 0; h < 24 * 5; h++) tickReef(s, t, 1);
    expect(reefChem(t.water).alk).toBeGreaterThan(8.2);
    expect(s.dryGoods.reef_alk).toBeLessThan(20);
    s.dryGoods.reef_alk = 0;
    const atStop = reefChem(t.water).alk;
    for (let h = 0; h < 24 * 3; h++) tickReef(s, t, 1);
    expect(reefChem(t.water).alk).toBeLessThan(atStop);
  });

  it('salt-mix water changes move chemistry toward natural seawater; plain water dilutes it', () => {
    const s = reefGame();
    const t = s.tanks.R1;
    t.water.alk = 6;
    t.water.calcium = 360;
    s.dryGoods.salt_mix = 5;
    doWaterChange(s, t, 0.5);
    expect(reefChem(t.water).alk).toBeCloseTo(7, 5);
    expect(reefChem(t.water).calcium).toBeCloseTo(390, 5);
    s.dryGoods.salt_mix = 0;
    doWaterChange(s, t, 0.5);
    expect(reefChem(t.water).alk).toBeLessThan(4);
  });

  it('aggressive corals sting other genera within reach, but not their own genus', () => {
    const s = reefGame();
    const t = bareReef(s);
    const torch = coral(s, t, 'torch', 0.5, 1, 1.2);
    const acro = coral(s, t, 'acropora', 0.55, 0, 1.2);
    const hammer = coral(s, t, 'hammer', 0.45, 1, 1.2);
    expect(assessCoral(t, acro).stungBy).toContain('Torch Coral');
    expect(assessCoral(t, hammer).stungBy).not.toContain('Torch Coral');
    expect(assessCoral(t, torch).stings).toContain('Acropora');
    expect(diagnoseTank(s, t).issues.some((i) => i.id === 'coral_sting')).toBe(true);
  });

  it('fragging needs size, health and a plug; the frag goes to the frag rack, not the plant shelf', () => {
    const s = reefGame();
    const t = bareReef(s);
    const zoa = coral(s, t, 'zoanthids', 0.5, 1, 0.5);
    s.dryGoods.frag_plugs = 1;
    expect(fragRefusal(s, zoa)).toMatch(/Too small/);
    zoa.size = 1.2;
    s.dryGoods.frag_plugs = 0;
    expect(fragRefusal(s, zoa)).toMatch(/frag plugs/);
    s.dryGoods.frag_plugs = 2;
    const r = fragCoral(s, t, zoa.uid);
    expect(r.ok, r.message).toBe(true);
    expect(zoa.size).toBeCloseTo(1.2 - FRAG_SIZE, 6);
    expect(s.dryGoods.frag_plugs).toBe(1);
    const frags = availableFrags(s);
    expect(frags).toHaveLength(1);
    expect(availablePlants(s).some((p) => p.uid === frags[0].uid)).toBe(false);
    // Frag prices have their own multiplier.
    const p = plantPrice(s, frags[0]);
    s.prices[FRAG_PRICE_KEY] = 2;
    expect(plantPrice(s, frags[0])).toBeCloseTo(p * 2, 1);
  });

  it('corals cannot go in freshwater, and are sold from shop level 5', () => {
    const s = newGame({ seed: 3 });
    buildUpTo(s, 3);
    s.money = 1e6;
    expect(addDecor(s, s.tanks.M1, 'zoanthids', 0.5, 1).message).toMatch(/level 5/);
    expect(addDecor(s, s.tanks.A1, 'live_rock', 0.5, 1).ok).toBe(false);
    buildUpTo(s, 5);
    expect(addDecor(s, s.tanks.F1, 'zoanthids', 0.5, 1).ok).toBe(false);
    expect(addDecor(s, s.tanks.M1, 'zoanthids', 0.5, 1).ok).toBe(true);
  });

  it("the aquascape preview shows the coral's light and flow at the spot, from the same assessment", () => {
    const s = reefGame();
    const t = bareReef(s);
    for (const layer of [0, 1, 2] as const) {
      const ex = explainPlacement(s, t.id, { defId: 'hammer', x: 0.5, layer, size: 0.5, source: 'buy' });
      const real = coral(s, t, 'hammer', 0.5, layer, 0.5);
      const a = assessCoral(t, real);
      expect(ex.coral!.par).toBe(a.par);
      expect(ex.coral!.flow).toBe(a.flow);
      expect(ex.coral!.perch).toBe(a.perch);
      t.decor.pop();
    }
  });

  it('reef state survives save and load', () => {
    const s = reefGame();
    const t = s.tanks.R2;
    t.water.alk = 7.2;
    t.reef!.doser = true;
    t.decor.find((d) => getDecor(d.defId).kind === 'coral')!.bleach = 0.4;
    const back = deserialize(JSON.parse(JSON.stringify(serialize(s, 'slot1'))));
    expect(back.tanks.R2.reef).toEqual(t.reef);
    expect(reefChem(back.tanks.R2.water).alk).toBeCloseTo(7.2, 6);
    expect(back.tanks.R2.decor).toEqual(t.decor);
  });

  it('a coral in poor conditions declines and dies, with a logged cause', () => {
    const s = reefGame();
    const t = bareReef(s);
    const acro = coral(s, t, 'acropora', 0.5, 2, 1);
    t.water.alk = 4;
    t.water.nitrate = 40;
    const died: string[] = [];
    for (let h = 0; h < 24 * 60 && t.decor.includes(acro); h++) tickReef(s, t, 1, { onCoralDeath: (name, _t, cause) => died.push(`${name}:${cause}`) });
    expect(t.decor.includes(acro)).toBe(false);
    expect(died[0]).toMatch(/^Acropora:/);
  });
});
