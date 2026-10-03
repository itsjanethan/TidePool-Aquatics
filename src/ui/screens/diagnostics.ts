/**
 * Tank status UI built on sim/tankDiagnostics: the overview shown at the top
 * of the tank menu, issue detail screens with predicted effects and links to
 * the action that helps, and the full status page.
 */
import type { GameController } from '../../game/GameController';
import { getSpecies } from '../../data/species';
import { FIXES, type FixId } from '../../sim/preview';
import { diagnoseTank, STATUS_LABEL, type DiagAction, type Diagnostic, type NavId, type TankReport } from '../../sim/tankDiagnostics';
import { h, meter } from '../dom';
import type { MenuItem } from '../menu';
import type { MenuScreen } from '../ui';
import { helpItem, helpLink } from './help';
import { openEquipmentFor, openLivestock, openMaintenanceFor, openWaterTest } from './tankMenu';
import { openSuppliers } from './office';

const SEV_MARK: Record<Diagnostic['severity'], string> = { critical: '!!', warning: '⚠', advice: '·' };

function scoreRow(label: string, v: number, help: string, invert = false): HTMLElement {
  const cls = invert ? (v > 100 ? 'bad' : v > 80 ? 'warn' : 'good') : v < 50 ? 'bad' : v < 75 ? 'warn' : 'good';
  return h('div', { class: 'row' }, helpLink(label, help), meter(Math.min(1, v / 100), cls), h('span', null, `${v}%`));
}

/** Concise "is this tank OK, and if not, why?" block. */
export function overviewEl(report: TankReport, maxIssues = 3): HTMLElement {
  const s = report.scores;
  const top = report.issues.filter((i) => i.severity !== 'advice').slice(0, maxIssues);
  return h(
    'div',
    { class: 'tank-overview' },
    h('div', { class: `overall overall-${report.status}` }, `Overall: ${STATUS_LABEL[report.status].toUpperCase()}`),
    report.status === 'empty' ? null : scoreRow('Fish welfare', s.welfare, 'welfare'),
    scoreRow('Water', s.water, 'water_quality'),
    scoreRow('Cleanliness', s.cleanliness, 'cleanliness'),
    report.status === 'empty' ? null : scoreRow('Habitat', s.habitat, 'habitat'),
    scoreRow('Stocking', s.stocking, 'stocking', true),
    ...top.map((i) => h('div', { class: `issue-line sev-${i.severity}` }, `${SEV_MARK[i.severity]} ${i.title}${i.value ? `: ${i.value}` : ''}`)),
  );
}

/** Runs a fix through the controller (time passes) and refreshes callers. */
export function runFix(c: GameController, tankId: string, fix: FixId, after?: () => void): void {
  const blocked = c.lockReason('maintenance');
  if (blocked) {
    c.ui.toast(blocked, 'warn');
    return;
  }
  c.perform(FIXES[fix].run(c.state, c.state.tanks[tankId]));
  after?.();
}

/** Opens the screen an action points to. */
export function navigate(c: GameController, tankId: string, nav: NavId, parent?: MenuScreen): void {
  if (nav === 'aquascape') {
    const blocked = c.lockReason('aquascape');
    if (blocked) c.ui.toast(blocked, 'warn');
    else c.openTankView(tankId, 'aquascape');
  } else if (nav === 'livestock') openLivestock(c, tankId);
  else if (nav === 'equipment') openEquipmentFor(c, tankId, parent);
  else if (nav === 'waterTest') openWaterTest(c, tankId);
  else if (nav === 'maintenance') openMaintenanceFor(c, tankId, parent);
  else if (nav === 'order') openSuppliers(c);
}

function actionItem(c: GameController, tankId: string, a: DiagAction, refresh: () => void, parent?: MenuScreen): MenuItem {
  if (a.fix) {
    const blocked = c.lockReason('maintenance');
    return {
      label: a.label,
      right: blocked ? 'Idle Mode' : 'Do it',
      disabled: !!blocked,
      hint: blocked ?? a.effect ?? FIXES[a.fix].label,
      action: () => runFix(c, tankId, a.fix!, refresh),
    };
  }
  return { label: a.label, right: 'Open', hint: a.effect ?? 'Opens the screen where you can do this.', action: () => navigate(c, tankId, a.nav!, parent) };
}

/** Detail for one issue: numbers, who is affected, consequences, actions with predicted effects. */
export function openIssue(c: GameController, tankId: string, issueId: string, parent?: MenuScreen): void {
  const find = () => diagnoseTank(c.state, c.state.tanks[tankId], true).issues.find((i) => i.id === issueId) ?? null;
  let issue = find();
  if (!issue) return;
  const refresh = () => {
    issue = find();
    if (!issue) {
      c.ui.remove(scr);
      c.ui.toast('Sorted: that problem is gone.', 'good');
    } else scr.refresh(items());
    (parent as (MenuScreen & { refreshAll?: () => void }) | undefined)?.refreshAll?.();
  };
  const body = () => {
    const i = issue!;
    return h(
      'div',
      { class: 'issue-detail' },
      h('div', { class: `issue-title sev-${i.severity}` }, `${SEV_MARK[i.severity]} ${i.title.toUpperCase()}`),
      i.value ? h('div', { class: 'row' }, h('span', null, 'Now'), h('b', null, i.value)) : null,
      i.recommended ? h('div', { class: 'row' }, h('span', null, 'Recommended'), h('span', null, i.recommended)) : null,
      h('div', { class: 'small' }, i.explanation),
      i.affected.length ? h('div', { class: 'small' }, 'Affects: ', i.affected.map((a) => `${a.count} ${a.label}`).join(', ')) : null,
      i.consequences.length ? h('div', { class: 'small warn' }, 'Leads to: ', i.consequences.join(', ')) : null,
      i.help ? h('div', { class: 'small' }, helpLink('More about this', i.help)) : null,
    );
  };
  const items = (): MenuItem[] => {
    if (!issue) return [{ label: 'Back', action: () => c.ui.remove(scr) }];
    return [
      { label: 'What helps', header: true },
      ...issue.actions.map((a) => actionItem(c, tankId, a, refresh, parent)),
      ...(issue.help ? [helpItem(issue.help)] : []),
      { label: 'Back', action: () => c.ui.remove(scr) },
    ];
  };
  const scr = c.ui.menu({ title: c.state.tanks[tankId].name, body, items: items(), className: 'wide' });
}

/** Menu rows for the most important issues (top of the tank menu). */
export function issueItems(c: GameController, tankId: string, report: TankReport, parent: MenuScreen, max = 3): MenuItem[] {
  return report.issues
    .filter((i) => i.severity !== 'advice')
    .slice(0, max)
    .map((i) => ({
      label: `${SEV_MARK[i.severity]} ${i.title}`,
      right: i.value ?? '',
      className: `sev-${i.severity}`,
      hint: `${i.explanation} Confirm for details and fixes.`,
      action: () => openIssue(c, tankId, i.id, parent),
    }));
}

/** Everything about the tank's condition, including advice and habitat numbers. */
export function openTankStatus(c: GameController, tankId: string, parent?: MenuScreen): void {
  const s = c.state;
  const items = (): MenuItem[] => {
    const r = diagnoseTank(s, s.tanks[tankId]);
    const list: MenuItem[] = [];
    if (!r.issues.length) list.push({ label: 'No problems found', disabled: true, hint: 'Keep feeding and doing regular water changes.' });
    for (const i of r.issues) list.push({ label: `${SEV_MARK[i.severity]} ${i.title}`, right: i.value ?? '', className: `sev-${i.severity}`, hint: i.explanation, action: () => openIssue(c, tankId, i.id, scr) });
    list.push(helpItem('habitat', 'Help: habitat numbers'), { label: 'Back', action: () => c.ui.remove(scr) });
    return list;
  };
  const body = () => {
    const r = diagnoseTank(s, s.tanks[tankId]);
    const n = r.needs;
    return h(
      'div',
      null,
      overviewEl(r, 0),
      h('div', { class: 'section-title' }, 'Habitat'),
      h('div', { class: 'row' }, helpLink('Hiding cover', 'cover'), h('span', null, `${r.coverPct}% / ${n.coverPct}% recommended`)),
      n.coverBy.length ? h('div', { class: 'small' }, n.coverBy.map((x) => `${getSpecies(x.speciesId).commonName} want ${x.pct}%`).join(' · ')) : null,
      h('div', { class: 'row' }, helpLink('Cave spaces', 'caves'), h('span', null, `${r.scape.caveSlots} / ${n.caveSlots} needed`)),
      h('div', { class: 'row' }, helpLink('Open swimming space', 'openspace'), h('span', null, `${Math.round(r.scape.openSpace * 100)}%${n.openSpace ? ` / ${Math.round(n.openSpace * 100)}% wanted` : ''}`)),
    );
  };
  const scr = c.ui.menu({ title: `Status: ${s.tanks[tankId].name}`, body, items: items(), className: 'wide tall' });
  (scr as MenuScreen & { refreshAll?: () => void }).refreshAll = () => scr.refresh(items());
  void parent;
}
