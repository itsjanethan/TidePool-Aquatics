/**
 * All tanks at a glance: every tank on every built floor with its status,
 * inhabitants and the most serious problem, worst first if wanted. Reached
 * from the office PC and the pause menu; picking a tank opens its menu.
 */
import type { GameController } from '../../game/GameController';
import { FLOORS, floorOfTank } from '../../data/floors';
import { incomingCount } from '../../sim/incoming';
import { diagnoseTank, STATUS_LABEL, type TankReport } from '../../sim/tankDiagnostics';
import { h } from '../dom';
import type { MenuItem } from '../menu';
import { speciesSummary } from './common';
import { openTankMenu } from './tankMenu';

const RANK: Record<TankReport['status'], number> = { urgent: 0, attention: 1, good: 2, empty: 3 };

interface Row {
  id: string;
  floor: string;
  report: TankReport;
}

function rows(c: GameController): Row[] {
  const s = c.state;
  return s.tankOrder.filter((id) => s.tanks[id]).map((id) => ({ id, floor: floorOfTank(id), report: diagnoseTank(s, s.tanks[id]) }));
}

function rowItem(c: GameController, r: Row): MenuItem {
  const s = c.state;
  const t = s.tanks[r.id];
  const top = r.report.issues.filter((i) => i.severity !== 'advice').slice(0, 2);
  const inc = incomingCount(s, r.id);
  const what = speciesSummary(s, r.id) || (t.habitat ? 'no animals' : 'no fish');
  return {
    label: `${t.name} · ${t.habitat ?? `${t.litres}L`}`,
    right: STATUS_LABEL[r.report.status],
    className: `ov-${r.report.status}`,
    hint: `${what}${inc ? ` · ${inc} on order` : ''}${top.length ? ` · ${top.map((i) => `${i.title}${i.value ? ` (${i.value})` : ''}`).join(' · ')}` : ''}`,
    action: () => openTankMenu(c, r.id),
  };
}

export function openTanksOverview(c: GameController): void {
  let worstFirst = true;
  const items = (): MenuItem[] => {
    const all = rows(c);
    const counts = { urgent: 0, attention: 0, good: 0, empty: 0 };
    for (const r of all) counts[r.report.status]++;
    const list: MenuItem[] = [
      {
        label: worstFirst ? 'Order: most urgent first' : 'Order: by floor',
        right: 'switch',
        hint: 'Switch between worst-first and floor by floor.',
        action: () => {
          worstFirst = !worstFirst;
          scr.refresh(items());
        },
      },
    ];
    if (worstFirst) {
      const sorted = [...all].sort((a, b) => RANK[a.report.status] - RANK[b.report.status]);
      for (const r of sorted) list.push(rowItem(c, r));
    } else {
      for (const f of FLOORS) {
        const here = all.filter((r) => r.floor === f.id);
        if (!here.length) continue;
        list.push({ label: f.layout.name, header: true });
        for (const r of here) list.push(rowItem(c, r));
      }
    }
    list.push({ label: 'Back', action: () => c.ui.remove(scr) });
    summary = `${counts.urgent} urgent · ${counts.attention} need attention · ${counts.good} good · ${counts.empty} empty`;
    return list;
  };
  let summary = '';
  const first = items();
  const scr = c.ui.menu({
    title: 'All tanks',
    body: () => h('div', { class: 'small' }, `${summary}. Pick a tank to open its menu.`),
    items: first,
    className: 'wide tall',
  });
}
