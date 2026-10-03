/** Shop Progression (office PC): levels, expansions, their requirements and what they unlock. */
import type { GameController } from '../../game/GameController';
import { formatMoney } from '../../core/math';
import { getFloorLayout } from '../../data/floors';
import { allExpansions, buyExpansion, expansionStatus } from '../../sim/expansion';
import { h } from '../dom';
import type { MenuItem } from '../menu';
import { helpItem } from './help';
import { locked } from './locks';

export function openProgression(c: GameController): void {
  const s = c.state;
  const items = (): MenuItem[] => [
    ...allExpansions(s).map((e) => ({
      label: `Level ${e.def.level}: ${e.def.name}`,
      right: e.built ? 'Open' : e.canBuy ? formatMoney(e.def.cost) : e.available ? `${e.requirements.filter((r) => r.met).length}/${e.requirements.length}` : 'Locked',
      className: e.built ? 'good' : e.canBuy ? '' : 'dim',
      hint: e.def.blurb,
      action: () => openExpansion(c, e.def.id, () => scr.refresh(items())),
    })),
    helpItem('shop_levels'),
    { label: 'Back', action: () => c.ui.remove(scr) },
  ];
  const scr = c.ui.menu({
    title: 'Shop Progression',
    body: () => h('div', null, h('div', { class: 'row' }, h('span', null, 'Shop level'), h('b', null, `${s.shopLevel} / 4`)), h('div', { class: 'small' }, 'Each level opens a new floor. Meet the requirements, then buy the expansion.')),
    items: items(),
    className: 'wide',
  });
}

function openExpansion(c: GameController, id: string, done: () => void): void {
  const s = c.state;
  const body = () => {
    const e = expansionStatus(s, id);
    return h(
      'div',
      null,
      h('div', null, e.def.blurb),
      h('div', { class: 'section-title' }, 'Requirements'),
      ...e.requirements.map((r) => h('div', { class: `row ${r.met ? 'good' : 'warn'}` }, h('span', null, `${r.met ? '✔' : '○'} ${r.label}`), h('span', null, `${r.have} / ${r.need}`))),
      h('div', { class: 'section-title' }, 'Unlocks'),
      ...e.def.unlocks.map((u) => h('div', { class: 'small' }, `• ${u}`)),
      h('div', { class: 'row' }, h('span', null, 'Cost'), h('b', null, formatMoney(e.def.cost))),
      h('div', { class: 'row small' }, h('span', null, 'Extra rent'), h('span', null, `${formatMoney(e.def.rent)} per day`)),
    );
  };
  const items = (): MenuItem[] => {
    const e = expansionStatus(s, id);
    if (e.built) return [{ label: `Open: ${getFloorLayout(e.def.floor).name}`, disabled: true, hint: 'Take the stairs to visit it.' }, { label: 'Back', action: () => c.ui.remove(scr) }];
    return [
      locked(c, 'expand', {
        label: `Buy expansion (${formatMoney(e.def.cost)})`,
        disabled: !e.canBuy,
        hint: e.canBuy ? 'Builds it now. Stairs open straight away.' : 'Meet every requirement first.',
        action: () => void c.ui.confirm(`Build ${e.def.name} for ${formatMoney(e.def.cost)}? Rent rises by ${formatMoney(e.def.rent)} a day.`).then((y) => {
          if (!y) return;
          const r = c.perform(buyExpansion(s, id));
          if (r.ok) {
            c.ui.remove(scr);
            done();
            c.refreshWorld();
          }
        }),
      }),
      { label: 'Back', action: () => c.ui.remove(scr) },
    ];
  };
  const scr = c.ui.menu({ title: expansionStatus(s, id).def.name, body, items: items(), className: 'wide' });
}
