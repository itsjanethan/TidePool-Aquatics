/** Tank interaction menu and its sub-screens. */
import type { GameController } from '../../game/GameController';
import { formatMoney, round } from '../../core/math';
import { FILTERS, getDecor, getFilter, HEATERS } from '../../data/catalog';
import { openTankPlants } from './plants';
import { getSpecies } from '../../data/species';
import { assessSpeciesForSetup } from '../../sim/compat';
import { fishPrice, priceRatio } from '../../sim/customers';
import { fishInTank, moveFish } from '../../sim/fish';
import { breedingConditions, isFry, lifeStage } from '../../sim/breeding';
import { establishStrain, strainEligibility } from '../../sim/genetics';
import { sellFishToTrade, tradeValue } from '../../sim/trade';
import { setNotForSale } from '../../sim/protection';
import {
  buyFilter, buyHeater, feedingNeed, feedTank, removeDead, removeHeater, setHeater, SKIMMER_COST, toggleAirStone, toggleSkimmer, useBacteriaStarter, type ActionResult,
} from '../../sim/tank';
import { FIXES, previewFix, previewLine, type FixId } from '../../sim/preview';
import { diagnoseTank, STATUS_LABEL } from '../../sim/tankDiagnostics';
import { issueItems, openTankStatus, overviewEl } from './diagnostics';
import { helpItem, helpLink } from './help';
import { locked } from './locks';
import type { FishEntity } from '../../sim/types';
import { h } from '../dom';
import { incomingCount, incomingSummary } from '../../sim/incoming';
import { openIncoming } from './incoming';
import { openReefCare } from './reef';
import { climateReportEl, enclosureEquipment, feederRight } from './enclosure';
import { enclosureFeeder, habitatRefusal, isLandAnimal, isLandOnly, landVolume, setupHeated } from '../../sim/terrarium';
import type { MenuItem } from '../menu';
import type { MenuScreen } from '../ui';
import { fishCard, fishLabel, tankHeader, waterReportEl } from './common';

export function openTankMenu(c: GameController, tankId: string): void {
  const s = c.state;
  const tank = s.tanks[tankId];
  const toggleSale = () => { tank.forSale = tank.forSale === false ? undefined : false; screen.refresh(items()); };
  const items = (): MenuItem[] => {
    const n = fishInTank(s, tankId).length;
    const report = diagnoseTank(s, tank);
    return [
      ...issueItems(c, tankId, report, screen, 3),
      { label: 'Tank Status', right: STATUS_LABEL[report.status], hint: 'Every issue and the habitat numbers (cover, caves, swimming space) for this tank.', action: () => openTankStatus(c, tankId, screen) },
      ...(incomingCount(s, tankId)
        ? [{ label: `On order (${incomingCount(s, tankId)})`, right: 'not arrived', className: 'incoming', hint: `${incomingSummary(s, tankId)}. See what will be here after delivery, or cancel.`, action: () => openIncoming(c, tankId, () => screen.refresh(items())) }]
        : []),
      { label: 'View Tank', hint: 'Watch your fish up close.', action: () => c.openTankView(tankId) },
      locked(c, 'maintenance', { label: 'Feed', right: tank.habitat && enclosureFeeder(s, tank) ? feederRight(s, tank) : `food: ${Math.floor(s.foodUnits)}`, action: () => openFeed(c, tankId, screen) }),
      { label: `Livestock (${n})`, action: () => openLivestock(c, tankId) },
      isLandOnly(tank)
        ? { label: 'Climate check', hint: 'Humidity, temperature, basking spot, ventilation, mould, waste and the water dish, against what these animals need.', action: () => openWaterTest(c, tankId) }
        : { label: tank.habitat ? 'Water test and climate' : 'Water Test', hint: 'Takes 5 minutes.', action: () => openWaterTest(c, tankId) },
      locked(c, 'maintenance', { label: 'Maintenance', hint: 'Water changes and cleaning, with the expected result of each.', action: () => openMaintenance(c, tankId, screen) }),
      { label: 'Equipment', hint: c.idle ? 'View only in Idle Mode.' : undefined, action: () => openEquipment(c, tankId, screen) },
      locked(c, 'aquascape', { label: 'Aquascape', hint: 'Decorate with a live preview: plants, rocks, wood, substrate and background.', action: () => c.openTankView(tankId, 'aquascape') }),
      ...(tank.waterType === 'marine'
        ? [{ label: `Reef care (${tank.decor.filter((d) => getDecor(d.defId).kind === 'coral').length} corals)`, hint: 'Alkalinity, calcium and magnesium, dosing, reef light, wavemaker, and how every coral is doing. Frag corals here.', action: () => openReefCare(c, tankId, screen) }]
        : [{ label: `Plants (${tank.decor.filter((d) => getDecor(d.defId).kind === 'plant').length})`, hint: 'See how your plants are growing and take cuttings.', action: () => openTankPlants(c, tank) }]),
      { label: 'Breeding', hint: 'Who can breed here, what is stopping them, and any eggs or pregnancies.', action: () => openBreeding(c, tankId) },
      locked(c, 'price', { label: 'Prices', action: () => openPrices(c, tankId) }),
      locked(c, 'livestock', {
        label: 'Customers can buy',
        right: tank.forSale === false ? 'No' : 'Yes',
        hint: 'Set to No for breeding, grow-out or display tanks so customers leave them alone.',
        action: toggleSale,
        onLeft: toggleSale,
        onRight: toggleSale,
      }),
      helpItem('overall', 'Help: reading tank status'),
      { label: 'Close', action: () => c.ui.remove(screen) },
    ];
  };
  const body = () => h('div', null, tankHeader(s, tank, false), overviewEl(diagnoseTank(s, tank), 0));
  const screen: MenuScreen = c.ui.menu({ title: tank.name, items: [], body, className: 'tank-menu' });
  screen.refresh(items());
  (screen as MenuScreen & { refreshAll?: () => void }).refreshAll = () => screen.refresh(items());
}

function refreshParent(parent: MenuScreen | undefined): void {
  const p = parent as (MenuScreen & { refreshAll?: () => void }) | undefined;
  p?.refreshAll?.();
}

/** Hint text: what the action will do, computed by running it on a copy of the state. */
function previewHint(c: GameController, tankId: string, fix: FixId, extra = ''): string {
  return `${extra ? `${extra} ` : ''}Expected: ${previewLine(previewFix(c.state, tankId, fix))}`;
}

function openFeed(c: GameController, tankId: string, parent?: MenuScreen): void {
  const s = c.state;
  const tank = s.tanks[tankId];
  const need = feedingNeed(s, tank);
  const run = (amount: 'light' | 'normal' | 'heavy') => {
    c.perform(feedTank(s, tank, amount));
    c.ui.remove(scr);
    refreshParent(parent);
  };
  const scr = c.ui.menu({
    title: 'Feed',
    body: h('div', null, tank.habitat && enclosureFeeder(s, tank)
      ? `${need < 0.5 ? 'The animals are not very hungry.' : need > 3 ? 'The animals look hungry!' : 'The animals could eat.'} Uses ${feederRight(s, tank)}${s.dryGoods.calcium_dust ? `; dusted with calcium (${s.dryGoods.calcium_dust} left)` : '; no calcium dust in stock'}. `
      : need < 0.5 ? 'The fish are not very hungry.' : need > 3 ? 'The fish look hungry!' : 'The fish could eat.', ' ', helpLink('Hunger', 'hunger')),
    items: [
      { label: 'Light pinch', hint: 'Half a meal. Safest for water quality.', action: () => run('light') },
      { label: 'Normal feed', hint: previewHint(c, tankId, 'feed', 'What they will eat in a couple of minutes.'), action: () => run('normal') },
      { label: 'Heavy feed', hint: 'Leftovers rot and pollute the water.', action: () => run('heavy') },
      { label: 'Back', action: () => c.ui.remove(scr) },
    ],
  });
}

export function openWaterTest(c: GameController, tankId: string): void {
  const s = c.state;
  c.sim!.advance(5);
  s.tanks[tankId].lastMaintenance.test = s.minute;
  const t = s.tanks[tankId];
  const scr = c.ui.menu({
    title: `${isLandOnly(t) ? 'Climate check' : 'Water Test'}: ${t.name}`,
    body: () => (isLandOnly(t) ? climateReportEl(s, t) : t.habitat ? h('div', null, climateReportEl(s, t), h('div', { class: 'small' }, 'Pool water:'), waterReportEl(s, t)) : waterReportEl(s, t)),
    items: isLandOnly(t)
      ? [helpItem('humidity', 'Help: humidity'), helpItem('basking', 'Help: basking and heat'), helpItem('ventilation', 'Help: ventilation'), helpItem('mould', 'Help: mould and waste'), { label: 'Done', action: () => c.ui.remove(scr) }]
      : [helpItem('cycle', 'Help: the nitrogen cycle'), helpItem('ammonia', 'Help: ammonia, nitrite, nitrate'), ...(t.habitat ? [helpItem('paludarium', 'Help: paludariums')] : []), { label: 'Done', action: () => c.ui.remove(scr) }],
    className: 'wide',
  });
}

/** Maintenance for a tank, usable from anywhere (diagnostics links here). */
export function openMaintenanceFor(c: GameController, tankId: string, parent?: MenuScreen): void {
  openMaintenance(c, tankId, parent);
}

export function openEquipmentFor(c: GameController, tankId: string, parent?: MenuScreen): void {
  openEquipment(c, tankId, parent);
}

function openMaintenance(c: GameController, tankId: string, parent?: MenuScreen): void {
  const s = c.state;
  const tank = s.tanks[tankId];
  const doIt = (fn: () => ActionResult) => {
    c.perform(fn());
    scr.refresh(items());
    refreshParent(parent);
  };
  const fixItem = (label: string, fix: FixId, extra: string): MenuItem =>
    locked(c, 'maintenance', { label, right: `${previewFix(s, tankId, fix).result.minutes || '-'} min`, hint: previewHint(c, tankId, fix, extra), action: () => doIt(() => FIXES[fix].run(s, tank)) });
  const dead = () => fishInTank(s, tankId, true).filter((f) => !f.alive).length;
  const terraItems = (): MenuItem[] => (tank.habitat
    ? [
        fixItem('Mist', 'mist', 'Damp substrate and humid air for a while.'),
        fixItem('Spot clean', 'spotClean', 'Droppings, dead feeders and mouldy patches out.'),
        fixItem('Refresh the water dish', 'dish', ''),
      ]
    : []);
  const items = (): MenuItem[] => isLandOnly(tank) ? [
    ...terraItems(),
    fixItem('Clean glass', 'glass', 'Condensation marks and smears.'),
    locked(c, 'maintenance', { label: 'Remove dead animals', right: dead() ? `${dead()}` : '-', disabled: !dead(), hint: 'They rot and spread mould.', action: () => doIt(() => removeDead(s, tank)) }),
    { label: 'Back', action: () => c.ui.remove(scr) },
  ] : [
    ...terraItems(),
    fixItem('Water change 25%', 'water25', 'Lowers nitrate and toxins gently.'),
    fixItem('Water change 50%', 'water50', 'Big reset. Large changes stress fish a little.'),
    fixItem('Clean glass', 'glass', ''),
    fixItem('Scrub algae', 'algae', ''),
    fixItem('Vacuum substrate', 'vacuum', 'Removes rotting food and waste.'),
    fixItem('Rinse filter media', 'filter', ''),
    ...(tank.waterType === 'marine' ? [fixItem('Top off with RO water', 'topoff', `Uses 1 RO water (stock ${s.dryGoods.ro_water ?? 0}).`)] : []),
    locked(c, 'maintenance', { label: 'Remove dead fish', right: dead() ? `${dead()}` : '-', disabled: !dead(), hint: 'Dead fish rot fast and poison the water.', action: () => doIt(() => removeDead(s, tank)) }),
    locked(c, 'maintenance', { label: 'Dose bacteria starter', right: `stock ${s.dryGoods.bacteria ?? 0}`, hint: 'Speeds up cycling a new tank.', disabled: !(s.dryGoods.bacteria > 0), action: () => doIt(() => useBacteriaStarter(s, tank)) }),
    { label: 'Back', action: () => c.ui.remove(scr) },
  ];
  const scr = c.ui.menu({ title: `Maintenance: ${tank.name}`, items: items(), body: () => h('div', null, tankHeader(s, tank, false), overviewEl(diagnoseTank(s, tank), 2)) });
}

function openEquipment(c: GameController, tankId: string, parent?: MenuScreen): void {
  const s = c.state;
  const tank = s.tanks[tankId];
  const doIt = (fn: () => ActionResult) => {
    c.perform(fn());
    scr.refresh(items());
    refreshParent(parent);
  };
  const items = (): MenuItem[] => {
    const list: MenuItem[] = tank.habitat ? enclosureEquipment(c, tank, doIt, () => scr.refresh(items())) : [];
    if (isLandOnly(tank)) {
      list.push(helpItem('humidity', 'Help: humidity'), helpItem('basking', 'Help: basking'), { label: 'Back', action: () => c.ui.remove(scr) });
      return list;
    }
    list.push({ label: tank.habitat ? 'Pool filter' : 'Filters', header: true });
    for (const f of FILTERS) {
      const current = tank.filterId === f.id;
      list.push(locked(c, 'buy', {
        label: `${current ? '● ' : ''}${f.name}`,
        right: current ? 'installed' : formatMoney(f.cost),
        hint: `Rated ${f.ratedLitres}L. ${f.ratedLitres < tank.litres ? 'Undersized for this tank.' : ''}`,
        disabled: current,
        action: () => doIt(() => buyFilter(s, tank, f.id)),
      }));
    }
    list.push({ label: 'Heating', header: true });
    if (tank.heaterId) {
      list.push(locked(c, 'maintenance', {
        label: 'Thermostat',
        right: `${tank.heaterSetpoint.toFixed(1)}°C`,
        hint: tank.heaterBroken ? 'The heater is broken! Buy a replacement.' : 'Use left/right to adjust.',
        onLeft: () => { setHeater(tank, tank.heaterSetpoint - 0.5); scr.refresh(items()); },
        onRight: () => { setHeater(tank, tank.heaterSetpoint + 0.5); scr.refresh(items()); },
      }));
      list.push(locked(c, 'maintenance', { label: 'Remove heater', hint: 'For coldwater species.', action: () => doIt(() => removeHeater(s, tank)) }));
    }
    for (const ht of HEATERS) {
      const current = tank.heaterId === ht.id && !tank.heaterBroken;
      list.push(locked(c, 'buy', { label: `${current ? '● ' : ''}${ht.name}`, right: current ? 'installed' : formatMoney(ht.cost), disabled: current, hint: `${(ht.watts / tank.litres).toFixed(1)} W per litre`, action: () => doIt(() => buyHeater(s, tank, ht.id)) }));
    }
    if (tank.waterType === 'marine') {
      list.push({ label: 'Marine', header: true });
      list.push(locked(c, 'buy', { label: tank.skimmer ? 'Protein skimmer: ON' : 'Fit protein skimmer', right: tank.skimmer ? 'remove' : formatMoney(SKIMMER_COST), hint: 'Removes waste before it rots into ammonia. Keeps marine water clear.', action: () => doIt(() => toggleSkimmer(s, tank)) }));
      list.push({ label: 'Reef light, wavemaker, dosing pump', right: 'Reef care', hint: 'Corals need the right light and water movement; stony corals need alkalinity and calcium topped up.', action: () => openReefCare(c, tankId, scr) });
    }
    list.push({ label: 'Aeration', header: true });
    list.push(locked(c, 'buy', { label: tank.airStone ? 'Air stone: ON' : 'Install air stone', right: tank.airStone ? 'switch off' : '£9.00', hint: 'More oxygen, more bubbles.', action: () => doIt(() => toggleAirStone(s, tank)) }));
    list.push(helpItem('filter', 'Help: filters'), helpItem('temperature', 'Help: temperature'));
    if (tank.waterType === 'marine') list.push(helpItem('skimmer', 'Help: skimmers'));
    list.push({ label: 'Back', action: () => c.ui.remove(scr) });
    return list;
  };
  const scr = c.ui.menu({ title: `Equipment: ${tank.name}`, items: items(), body: () => h('div', null, isLandOnly(tank) ? `${tank.habitat}: no water to filter or heat. Money: ${formatMoney(s.money)}` : `Current filter: ${getFilter(tank.filterId).name}. Money: ${formatMoney(s.money)}`) });
}

export function openPrices(c: GameController, tankId: string | null): void {
  const s = c.state;
  const speciesIds = tankId
    ? [...new Set(fishInTank(s, tankId).map((f) => f.speciesId))]
    : [...new Set(Object.values(s.fish).filter((f) => f.alive && f.tankId).map((f) => f.speciesId))];
  const items = (): MenuItem[] => {
    const list: MenuItem[] = speciesIds.map((id) => {
      const sp = getSpecies(id);
      const cur = s.prices[id] ?? sp.retailPrice;
      const ratio = priceRatio(s, id);
      const mood = ratio > 1.4 ? 'Most customers will find this expensive.' : ratio > 1.15 ? 'Pricier than usual.' : ratio < 0.85 ? 'Bargain! Low margins.' : 'A fair price.';
      const adj = (d: number) => {
        s.prices[id] = Math.max(0.2, round(cur + d, 2));
        scr.refresh(items());
      };
      return { label: sp.commonName, right: formatMoney(cur), hint: `Base price (adjusted per fish by size, colour and quality). Wholesale ~${formatMoney(sp.supplierCost)}. ${mood}`, onLeft: () => adj(-0.1), onRight: () => adj(0.1) };
    });
    if (!list.length) list.push({ label: 'No livestock to price.', disabled: true });
    list.push({ label: 'Reset to suggested', action: () => { for (const id of speciesIds) delete s.prices[id]; scr.refresh(items()); } });
    list.push({ label: 'Done', action: () => c.ui.remove(scr) });
    return list;
  };
  const scr = c.ui.menu({ title: 'Prices', items: items(), body: h('div', null, 'Left/right to change the base price per species.') });
}

export function openLivestock(c: GameController, tankId: string): void {
  const s = c.state;
  const items = (): MenuItem[] => {
    const fish = fishInTank(s, tankId, true).sort((a, b) => a.speciesId.localeCompare(b.speciesId) || b.sizeCm - a.sizeCm);
    const kept = fish.filter((f) => f.notForSale).length;
    const list: MenuItem[] = fish.map((f) => ({
      label: `${f.alive ? '' : '✝ '}${fishLabel(s, f)} ${f.sex === 'male' ? '♂' : f.sex === 'female' ? '♀' : ''}${f.pregnancy ? ' (pregnant)' : ''}`,
      right: !f.alive ? 'dead' : f.notForSale ? NFS_TAG : isFry(f) ? 'fry' : formatMoney(fishPrice(s, f)),
      className: f.notForSale ? 'nfs' : undefined,
      hint: `${lifeStage(f)} · ${f.sizeCm.toFixed(1)}cm · health ${Math.round(f.health)} · stress ${Math.round(f.stress)}${f.origin === 'bred' ? ` · bred F${f.generation}` : ''}${f.reservedBy ? ' · reserved by a customer' : ''}${f.notForSale ? ' · not for sale: kept by you' : ''}`,
      action: () => openFishDetail(c, f, () => scr.refresh(items())),
    }));
    if (!list.length) list.push({ label: 'This tank is empty.', disabled: true });
    else list.unshift({ label: 'Select fish: not for sale', right: kept ? `${kept} kept` : '', hint: 'Pick several fish and mark them not for sale (or for sale again) in one go.', action: () => openProtectSelect(c, tankId, () => scr.refresh(items())) });
    list.push({ label: 'Back', action: () => c.ui.remove(scr) });
    return list;
  };
  const scr = c.ui.menu({ title: `Livestock: ${s.tanks[tankId].name}`, items: items(), className: 'tall' });
}

export function openFishDetail(c: GameController, f: FishEntity, onChange: () => void): void {
  const s = c.state;
  const sameSpecies = () => (f.tankId ? fishInTank(s, f.tankId).filter((x) => x.speciesId === f.speciesId && !x.reservedBy) : []);
  const fryOfSpecies = () => sameSpecies().filter((x) => isFry(x));
  const items = (): MenuItem[] => {
    const elig = strainEligibility(s, f);
    const strain = f.strainName ? s.strains?.[f.strainName] : null;
    return [
      locked(c, 'livestock', { label: 'Move this fish', disabled: !f.alive || !!f.reservedBy, action: () => openMoveFish(c, [f], () => { c.ui.remove(scr); onChange(); }) }),
      locked(c, 'livestock', { label: `Move all ${getSpecies(f.speciesId).commonName} (${sameSpecies().length})`, disabled: !f.alive, action: () => openMoveFish(c, sameSpecies(), () => { c.ui.remove(scr); onChange(); }) }),
      locked(c, 'livestock', { label: `Move ${getSpecies(f.speciesId).commonName} fry (${fryOfSpecies().length})`, disabled: !fryOfSpecies().length, hint: 'Move fry to a grow-out tank where adults cannot eat them.', action: () => openMoveFish(c, fryOfSpecies(), () => { c.ui.remove(scr); onChange(); }) }),
      strain
        ? { label: `Strain: ${strain.name}`, disabled: true, hint: `Founded day ${strain.foundedDay}. Fry from two parents of this strain that show its look stay in the line.` }
        : locked(c, 'livestock', {
            label: 'Name a strain from this line',
            disabled: !elig.ok,
            hint: elig.reason,
            action: () => {
              const sp = getSpecies(f.speciesId);
              const morph = sp.morphs.find((m) => m.id === f.morphId)?.name ?? '';
              void c.ui.prompt('Name your strain', `${elig.reason} Strain name:`, `${s.playerName} ${morph}`).then((name) => {
                if (!name) return;
                const st = establishStrain(s, f, name);
                if (st) c.ui.toast(`Strain founded: ${st.name}. Related fish of this line now carry its name.`, 'good', 4000);
                scr.refresh(items());
                onChange();
              });
            },
          }),
      {
        label: 'Not for sale',
        right: f.notForSale ? 'On' : 'Off',
        disabled: !f.alive,
        hint: f.notForSale
          ? 'Kept by you: customers cannot reserve or buy this fish, staff will not sell it and the trade buyer will not take it. Feeding, moving and breeding are unaffected.'
          : 'Keep this fish (a breeder or a favourite): customers, staff and the trade buyer will leave it alone.',
        action: () => {
          if (!f.notForSale) {
            const res = setNotForSale(s, [f.id], true, c.sim?.customerCtx);
            c.ui.toast(res.message, 'good', 3500);
            scr.refresh(items());
            onChange();
            return;
          }
          void c.ui.confirm(`Put ${fishLabel(s, f)} up for sale again? Customers, staff and the trade buyer will be able to sell it.`).then((y) => {
            if (!y) return;
            c.ui.toast(setNotForSale(s, [f.id], false).message, 'info', 3500);
            scr.refresh(items());
            onChange();
          });
        },
      },
      locked(c, 'sell', {
        label: 'Sell to the trade buyer',
        right: f.notForSale ? NFS_TAG : f.alive ? formatMoney(tradeValue(s, f.id)) : '',
        disabled: !f.alive || !!f.reservedBy || !!f.notForSale,
        hint: f.notForSale ? 'This fish is marked not for sale. Turn that off first to sell it.' : 'The wholesaler takes surplus fish at a fraction of shop price. Useful when a breeding tank gets crowded.',
        action: () => void c.ui.confirm(`Sell ${fishLabel(s, f)} to the trade buyer for ${formatMoney(tradeValue(s, f.id))}?`).then((y) => {
          if (!y) return;
          c.perform(sellFishToTrade(s, [f.id]));
          c.ui.remove(scr);
          onChange();
        }),
      }),
      helpItem('genetics', 'Help: genetics and strains'),
      { label: 'Back', action: () => c.ui.remove(scr) },
    ];
  };
  const scr = c.ui.menu({ title: fishLabel(s, f), body: () => fishCard(s, f, true), className: 'wide tall', items: items() });
}

const NFS_TAG = 'Not for sale';

/**
 * Bulk "not for sale": tick fish, then protect or unprotect them together.
 * Unprotecting always asks first, so protection is never removed silently.
 */
export function openProtectSelect(c: GameController, tankId: string, onChange: () => void): void {
  const s = c.state;
  const picked = new Set<string>();
  const fish = () => fishInTank(s, tankId).sort((a, b) => a.speciesId.localeCompare(b.speciesId) || b.sizeCm - a.sizeCm);
  const done = (msg: string, kind: 'good' | 'info') => {
    c.ui.toast(msg, kind, 4000);
    picked.clear();
    scr.refresh(items());
    onChange();
  };
  const items = (): MenuItem[] => {
    const list = fish();
    const sel = list.filter((f) => picked.has(f.id));
    const keptSel = sel.filter((f) => f.notForSale).length;
    const species = [...new Set(list.map((f) => f.speciesId))];
    return [
      { label: 'Selected', header: true },
      {
        label: `Mark ${sel.length || ''} not for sale`.replace('  ', ' '),
        disabled: !sel.length || keptSel === sel.length,
        hint: sel.length ? `${sel.length - keptSel} will be protected; ${keptSel} already are. Reserved fish are taken out of the customer's basket.` : 'Tick some fish below first.',
        action: () => done(setNotForSale(s, sel.map((f) => f.id), true, c.sim?.customerCtx).message, 'good'),
      },
      {
        label: `Put ${keptSel || ''} up for sale again`.replace('  ', ' '),
        disabled: !keptSel,
        hint: keptSel ? `Removes protection from ${keptSel} selected fish (asks first).` : 'None of the selected fish are protected.',
        action: () =>
          void c.ui.confirm(`Put ${keptSel} fish up for sale again? Customers, staff and the trade buyer will be able to sell them.`).then((y) => {
            if (y) done(setNotForSale(s, sel.filter((f) => f.notForSale).map((f) => f.id), false).message, 'info');
          }),
      },
      { label: 'Select none', disabled: !sel.length, action: () => { picked.clear(); scr.refresh(items()); } },
      ...species.map((sid) => ({
        label: `Select all ${getSpecies(sid).commonName}`,
        action: () => {
          for (const f of list) if (f.speciesId === sid) picked.add(f.id);
          scr.refresh(items());
        },
      })),
      { label: `Fish (${sel.length} selected)`, header: true },
      ...list.map((f) => ({
        label: `${picked.has(f.id) ? '☑' : '☐'} ${fishLabel(s, f)} ${f.sex === 'male' ? '♂' : f.sex === 'female' ? '♀' : ''}`,
        right: f.notForSale ? NFS_TAG : isFry(f) ? 'fry' : formatMoney(fishPrice(s, f)),
        className: f.notForSale ? 'nfs' : undefined,
        hint: `${lifeStage(f)} · ${f.sizeCm.toFixed(1)}cm${f.reservedBy ? ' · reserved by a customer' : ''}${f.notForSale ? ' · not for sale' : ''}`,
        action: () => {
          if (picked.has(f.id)) picked.delete(f.id);
          else picked.add(f.id);
          scr.refresh(items());
        },
      })),
      { label: 'Done', action: () => c.ui.remove(scr) },
    ];
  };
  const scr = c.ui.menu({ title: `Not for sale: ${s.tanks[tankId].name}`, body: h('div', { class: 'small' }, 'Kept fish are never reserved, sold at the till, sold by staff or sold to the trade buyer.'), items: items(), className: 'tall' });
}

/** Breeding overview for a tank: who can breed, what is stopping them, pregnancies and eggs. */
export function openBreeding(c: GameController, tankId: string): void {
  const s = c.state;
  const t = s.tanks[tankId];
  const body = () => {
    const species = [...new Set(fishInTank(s, tankId).map((f) => f.speciesId))];
    const blocks: HTMLElement[] = [];
    if (!species.length) blocks.push(h('div', { class: 'small' }, 'No fish in this tank.'));
    for (const sid of species) {
      const sp = getSpecies(sid);
      const r = breedingConditions(s, t, sid);
      const chance = r.factor <= 0 ? 'Not possible right now' : r.factor < 0.3 ? 'Unlikely' : r.factor < 0.8 ? 'Possible' : 'Likely';
      const fish = fishInTank(s, tankId).filter((f) => f.speciesId === sid);
      const pregnant = fish.filter((f) => f.pregnancy);
      const fry = fish.filter((f) => isFry(f)).length;
      const broods = (t.broods ?? []).filter((b) => b.speciesId === sid);
      blocks.push(
        h('div', { class: 'section-title' }, `${sp.commonName}: ${chance}`),
        h('div', { class: 'small' }, `${methodText(sp.breeding.method)} Adults: ${r.males} male, ${r.females} female. Fry: ${fry}.`),
        ...r.good.map((g) => h('div', { class: 'small good' }, `✔ ${g}`)),
        ...r.reasons.slice(0, 3).map((g) => h('div', { class: 'small warn' }, `✘ ${g}`)),
        ...pregnant.map((f) => h('div', { class: 'small good' }, `${fishLabel(s, f)} is pregnant: about ${Math.max(1, Math.ceil(f.pregnancy!.daysRemaining))} day(s).`)),
        ...broods.map((b) => h('div', { class: 'small good' }, `About ${b.count} eggs, hatching in ${Math.max(1, Math.ceil(b.daysLeft))} day(s).`)),
      );
    }
    blocks.push(h('div', { class: 'small' }, 'Tip: adult fish eat fry. Dense plants help, or move fry to their own grow-out tank.'));
    return h('div', null, ...blocks);
  };
  const scr = c.ui.menu({ title: `Breeding: ${t.name}`, body, items: [{ label: 'Back', action: () => c.ui.remove(scr) }], className: 'wide tall' });
}

function methodText(m: string): string {
  switch (m) {
    case 'livebearer': return 'Livebearer: gives birth to live fry.';
    case 'egg_scatterer': return 'Egg scatterer: eggs are often eaten unless hidden in plants.';
    case 'adhesive_eggs': return 'Lays sticky eggs, often after a cool water change.';
    case 'cave_spawner': return 'Cave spawner: the male guards eggs in a cave.';
    default: return '';
  }
}

function openMoveFish(c: GameController, fish: FishEntity[], done: () => void): void {
  const s = c.state;
  if (!fish.length) return;
  const from = fish[0].tankId;
  const sp = getSpecies(fish[0].speciesId);
  const items: MenuItem[] = s.tankOrder
    .filter((id) => id !== from)
    .map((id) => {
      const t = s.tanks[id];
      const resident = [...new Set(fishInTank(s, id).map((x) => x.speciesId))];
      const res = assessSpeciesForSetup(sp.id, { litres: isLandAnimal(sp) && t.habitat ? landVolume(t) : t.litres, lengthCm: t.lengthCm, heated: setupHeated(t), temperature: t.water.temperature, residentSpecies: resident, waterType: t.waterType ?? 'freshwater', habitat: t.habitat });
      const warn = res.issues[0] ?? (t.water.ammonia > 0.25 && !isLandAnimal(sp) ? 'Water is toxic!' : '');
      const wrongHabitat = habitatRefusal(sp, t);
      if (wrongHabitat) return { label: `${t.name} (${t.habitat ?? t.waterType ?? 'freshwater'})`, disabled: true, hint: wrongHabitat };
      const wrongWater = !isLandAnimal(sp) && sp.waterType !== (t.waterType ?? 'freshwater');
      if (wrongWater) return { label: `${t.name} (${t.waterType ?? 'freshwater'})`, disabled: true, hint: `${sp.commonName} is a ${sp.waterType} fish. It cannot live in this tank.` };
      return {
        label: `${t.name}${res.score < 0.75 ? ' ⚠' : ''}`,
        right: `${t.litres}L ${t.water.temperature.toFixed(0)}°C`,
        hint: warn || `Contains: ${resident.map((r) => getSpecies(r).commonName).join(', ') || 'nothing'}`,
        action: () => {
          for (const f of fish) moveFish(f, id);
          c.sim!.advance(5 + fish.length);
          c.ui.toast(`Moved ${fish.length} fish to ${t.name}.`, 'good');
          c.ui.remove(scr);
          done();
        },
      };
    });
  items.push({ label: 'Cancel', action: () => c.ui.remove(scr) });
  const scr = c.ui.menu({ title: `Move ${fish.length} ${sp.commonName} to...`, items, className: 'tall' });
}
