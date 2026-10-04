/**
 * Reef screens: reef care for a marine tank (chemistry, dosing, light, flow,
 * dosing pump and every coral's conditions), one coral's details and
 * fragging, and the frag rack customers buy from. All numbers come from
 * sim/reef.ts, the same functions the simulation runs.
 */
import type { GameController } from '../../game/GameController';
import { formatMoney, round } from '../../core/math';
import { getDecor } from '../../data/catalog';
import { DOSER_COST, FRAG_MIN_SIZE, PERCH_LABEL, REEF_LIGHTS, REEF_TARGETS, WAVEMAKERS } from '../../data/reef';
import { FRAG_PRICE_KEY, plantPrice } from '../../sim/customers';
import { FIXES, previewFix, previewLine, type FixId } from '../../sim/preview';
import { plantValue, sellPlantsToTrade, TRADE_RATE } from '../../sim/plants';
import {
  assessCoral, availableFrags, coralSizeLabel, DOSER_MAX_ALK_PER_DAY, coralsIn, doseUnits, fragCoral, fragLabel, fragRefusal, GROUP_LABEL, reefChem, reefDemand, reefLight, reefState,
  setReefLight, setWavemaker, tankFlow, toggleDoser,
} from '../../sim/reef';
import type { DecorItem, TankState } from '../../sim/types';
import { h, meter } from '../dom';
import type { MenuItem } from '../menu';
import type { MenuScreen } from '../ui';
import { helpItem } from './help';
import { locked } from './locks';

const pct = (v: number) => `${Math.round(v * 100)}%`;

/** Alkalinity, calcium and magnesium with targets, as reading rows. */
export function reefChemEl(tank: TankState): HTMLElement {
  const c = reefChem(tank.water);
  const d = reefDemand(tank);
  const row = (label: string, value: string, range: [number, number], v: number, note: string) => {
    const level = v < range[0] * 0.93 || v > range[1] * 1.1 ? 'bad' : v < range[0] || v > range[1] ? 'warn' : 'good';
    return h('div', { class: `reading ${level}` }, h('span', { class: 'r-label' }, label), h('span', { class: 'r-value' }, value), h('div', { class: 'r-note' }, note));
  };
  return h('div', { class: 'readings' },
    row('Alkalinity', `${c.alk.toFixed(1)} dKH`, REEF_TARGETS.alk, c.alk, `Target ${REEF_TARGETS.alk[0]}-${REEF_TARGETS.alk[1]}. Corals here use about ${d.alkPerDay.toFixed(2)} dKH a day.${(reefState(tank).alkSwing ?? 0) > 0.05 ? ` Today's swing ${(reefState(tank).alkSwing ?? 0).toFixed(1)} dKH.` : ''}`),
    row('Calcium', `${Math.round(c.calcium)} ppm`, REEF_TARGETS.calcium, c.calcium, `Target ${REEF_TARGETS.calcium[0]}-${REEF_TARGETS.calcium[1]}. Used about ${Math.round(d.calciumPerDay)} ppm a day.`),
    row('Magnesium', `${Math.round(c.magnesium)} ppm`, REEF_TARGETS.magnesium, c.magnesium, `Target ${REEF_TARGETS.magnesium[0]}-${REEF_TARGETS.magnesium[1]}. Keeps calcium and alkalinity in solution.`),
  );
}

/** One coral: what it is, how it is doing, and what this spot gives it. */
export function coralCardEl(tank: TankState, d: DecorItem): HTMLElement {
  const def = getDecor(d.defId);
  const a = assessCoral(tank, d);
  const t = a.traits;
  return h('div', { class: 'fish-card coral-card' },
    h('div', { class: 'fish-name' }, def.name, h('span', { class: 'small dim' }, ` · ${GROUP_LABEL[t.group]}`)),
    h('div', { class: 'row' }, h('span', null, coralSizeLabel(d.size)), meter(d.size / t.maxSize, 'good'), h('span', null, pct(d.size))),
    h('div', { class: 'row' }, h('span', null, 'Health'), meter(d.health, d.health < 0.5 ? 'bad' : d.health < 0.75 ? 'warn' : 'good'), h('span', null, pct(d.health))),
    (d.bleach ?? 0) > 0.05 ? h('div', { class: 'row' }, h('span', null, 'Bleached'), meter(d.bleach ?? 0, 'bad'), h('span', null, pct(d.bleach ?? 0))) : null,
    h('div', { class: 'small' }, `On the ${PERCH_LABEL[a.perch]}: ${a.par} PAR (wants ${t.par[0]}-${t.par[1]}), flow ${a.flow.toFixed(2)} (wants ${t.flow[0]}-${t.flow[1]}).`),
    h('ul', { class: 'aq-ex-list' }, ...a.notes.map((n) => h('li', { class: n.good ? 'good' : 'bad' }, n.text))),
    h('div', { class: 'small dim' }, `Growing about ${round(a.growthPerDay * 100, 1)}% a day.${t.group !== 'soft' ? ` Uses ${a.alkUsePerDay.toFixed(2)} dKH of alkalinity a day.` : ''}`),
  );
}

/** Coral details with fragging. */
export function openCoral(c: GameController, tankId: string, uid: string, onDone?: () => void): void {
  const s = c.state;
  const tank = s.tanks[tankId];
  const items = (): MenuItem[] => {
    const d = tank.decor.find((x) => x.uid === uid);
    if (!d) return [{ label: 'Back', action: () => c.ui.remove(scr) }];
    const why = fragRefusal(s, d);
    return [
      locked(c, 'aquascape', {
        label: 'Cut a frag',
        right: why ? 'not now' : `~${formatMoney(plantPrice(s, { defId: d.defId, size: 0.25, health: d.health * 0.95 }))}`,
        hint: why ?? `${getDecor(d.defId).coral!.frag} Uses 1 frag plug (stock ${s.dryGoods.frag_plugs ?? 0}). The colony drops to ${pct(d.size - 0.25)} and regrows.`,
        disabled: !!why,
        action: () => {
          c.perform(fragCoral(s, tank, uid));
          scr.refresh(items());
          onDone?.();
        },
      }),
      { label: 'Move it', hint: 'Open Aquascape and pick it up: try a different height or spot.', action: () => { c.ui.remove(scr); c.openTankView(tankId, 'aquascape'); } },
      helpItem('par', 'Help: light'),
      helpItem('fragging', 'Help: fragging'),
      { label: 'Back', action: () => c.ui.remove(scr) },
    ];
  };
  const body = () => {
    const d = tank.decor.find((x) => x.uid === uid);
    return d ? coralCardEl(tank, d) : h('div', null, 'This coral is gone.');
  };
  const scr = c.ui.menu({ title: getDecor(tank.decor.find((x) => x.uid === uid)?.defId ?? 'live_rock').name, body, items: items(), className: 'wide' });
}

/** Reef care for one marine tank. */
export function openReefCare(c: GameController, tankId: string, parent?: MenuScreen): void {
  const s = c.state;
  const tank = s.tanks[tankId];
  const doIt = (fn: () => { ok: boolean; message: string; minutes: number }) => {
    c.perform(fn());
    scr.refresh(items());
    (parent as (MenuScreen & { refreshAll?: () => void }) | undefined)?.refreshAll?.();
  };
  const dose = (label: string, fix: FixId, good: string): MenuItem =>
    locked(c, 'maintenance', {
      label,
      right: `${doseUnits(tank)} of ${s.dryGoods[good] ?? 0}`,
      hint: `One dose for ${tank.litres}L uses ${doseUnits(tank)}. Expected: ${previewLine(previewFix(s, tankId, fix))}`,
      action: () => doIt(() => FIXES[fix].run(s, tank)),
    });
  const items = (): MenuItem[] => {
    const r = reefState(tank);
    const list: MenuItem[] = [
      { label: 'Dosing', header: true },
      dose('Dose alkalinity buffer', 'doseAlk', 'reef_alk'),
      dose('Dose calcium', 'doseCa', 'reef_calcium'),
      dose('Dose magnesium', 'doseMg', 'reef_magnesium'),
      locked(c, 'buy', {
        label: r.doser ? 'Dosing pump: ON' : 'Fit a dosing pump',
        right: r.doser ? 'switch off' : formatMoney(DOSER_COST),
        hint: `Tops alkalinity (to 8.5 dKH) and calcium (to 420 ppm) up a little every hour from your stockroom supplements, up to ${DOSER_MAX_ALK_PER_DAY} dKH a day, so there are no daily swings.`,
        action: () => doIt(() => toggleDoser(s, tank)),
      }),
      { label: 'Reef light', header: true },
    ];
    for (const l of REEF_LIGHTS) {
      const on = r.light === l.id;
      list.push(locked(c, 'buy', { label: `${on ? '● ' : ''}${l.name}`, right: on ? 'fitted' : l.cost ? formatMoney(l.cost) : 'free', disabled: on, hint: `${l.par} PAR at the top of the rockwork, ${Math.round(l.par * 0.66)} in the middle, ${Math.round(l.par * 0.42)} on the sand. ${l.description}`, action: () => doIt(() => setReefLight(s, tank, l.id)) }));
    }
    list.push({ label: 'Water movement', header: true });
    for (const w of WAVEMAKERS) {
      const on = (r.wavemaker ?? 0) === w.level;
      const flowWith = round(tankFlow({ ...tank, reef: { ...r, wavemaker: w.level } }), 2);
      list.push(locked(c, 'buy', { label: `${on ? '● ' : ''}${w.name}`, right: on ? 'fitted' : w.cost ? formatMoney(w.cost) : 'free', disabled: on, hint: `Tank flow ${flowWith.toFixed(2)} at the top of the rock (${round(flowWith * 0.58, 2).toFixed(2)} on the sand).`, action: () => doIt(() => setWavemaker(s, tank, w.level)) }));
    }
    const corals = coralsIn(tank);
    list.push({ label: `Corals (${corals.length})`, header: true });
    for (const d of corals) {
      const a = assessCoral(tank, d);
      const bad = a.notes.filter((n) => !n.good);
      list.push({ label: `${getDecor(d.defId).name} · ${PERCH_LABEL[a.perch]}`, right: `${pct(d.health)}${(d.bleach ?? 0) > 0.2 ? ' bleached' : ''}`, className: bad.length ? 'warn' : '', hint: bad[0]?.text ?? `Doing well: ${a.par} PAR, flow ${a.flow.toFixed(2)}. ${d.size >= FRAG_MIN_SIZE ? 'Big enough to frag.' : ''}`, action: () => openCoral(c, tankId, d.uid, () => scr.refresh(items())) });
    }
    if (!corals.length) list.push({ label: 'No corals yet. Add them in Aquascape.', disabled: true });
    list.push(helpItem('alkalinity', 'Help: alkalinity'), helpItem('par', 'Help: light'), helpItem('flow', 'Help: water movement'), helpItem('coral_groups', 'Help: coral types'));
    list.push({ label: 'Back', action: () => c.ui.remove(scr) });
    return list;
  };
  const body = () => {
    const light = reefLight(tank);
    return h('div', null,
      h('div', { class: 'small' }, `${light.name}: ${light.par} PAR at the top of the rock. Flow ${tankFlow(tank).toFixed(2)} at the top. Doses for ${tank.litres}L use ${doseUnits(tank)} measure${doseUnits(tank) > 1 ? 's' : ''}.`),
      reefChemEl(tank),
    );
  };
  const scr = c.ui.menu({ title: `Reef care: ${tank.name}`, body, items: items(), className: 'wide tall' });
}

/** The frag rack: coral frags for sale, their prices and the trade buyer. */
export function openFragRack(c: GameController): void {
  const s = c.state;
  const items = (): MenuItem[] => {
    const frags = availableFrags(s).sort((a, b) => getDecor(a.defId).name.localeCompare(getDecor(b.defId).name) || b.size - a.size);
    const reserved = s.storage.plants.filter((p) => p.reservedBy && getDecor(p.defId).kind === 'coral').length;
    const mult = s.prices[FRAG_PRICE_KEY] ?? 1;
    const adj = (d: number) => {
      s.prices[FRAG_PRICE_KEY] = Math.max(0.3, round(mult + d, 2));
      scr.refresh(items());
    };
    const list: MenuItem[] = [
      locked(c, 'price', { label: 'Frag prices', right: `${Math.round(mult * 100)}%`, hint: 'Left/right: all frag prices up or down. Reef keepers pay well for healthy frags; weak or bleached ones do not sell.', onLeft: () => adj(-0.05), onRight: () => adj(0.05) }),
    ];
    if (!frags.length) list.push({ label: 'No frags on the rack. Cut them from healthy corals (Reef care or Aquascape).', disabled: true });
    for (const p of frags) {
      list.push({
        label: fragLabel(p),
        right: formatMoney(plantPrice(s, p)),
        hint: `${coralSizeLabel(p.size)}, health ${pct(p.health)}. Place it in a reef tank from Aquascape (stockroom list) to grow it on; bigger colonies are worth much more.`,
        className: p.health < 0.55 ? 'warn' : '',
      });
    }
    if (reserved) list.push({ label: `${reserved} reserved by customers`, disabled: true });
    if (frags.length) {
      list.push(locked(c, 'price', {
        label: 'Sell all to the trade buyer',
        right: formatMoney(round(frags.reduce((t, p) => t + plantValue(p) * TRADE_RATE, 0), 2)),
        hint: `A wholesaler takes everything at ${Math.round(TRADE_RATE * 100)}% of value.`,
        action: () => { c.perform(sellPlantsToTrade(s, frags.map((p) => p.uid))); scr.refresh(items()); },
      }));
    }
    list.push(helpItem('fragging', 'Help: fragging'), { label: 'Close', action: () => c.ui.remove(scr) });
    return list;
  };
  const scr = c.ui.menu({ title: 'Frag rack', body: h('div', { class: 'small' }, 'Coral frags on plugs. Customers on the reef floor buy from here, and pay more for healthy, larger pieces.'), items: items(), className: 'wide' });
}
