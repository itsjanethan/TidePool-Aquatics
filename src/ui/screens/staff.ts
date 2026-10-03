/** Staff screens: the team, hiring, one employee, and staff suggestions (proposals). */
import type { GameController } from '../../game/GameController';
import { formatMoney } from '../../core/math';
import { getPersonality, getRole, ROLES, SKILL_LABEL } from '../../data/staff';
import { getSpecies } from '../../data/species';
import { getDecor } from '../../data/catalog';
import { getFloorLayout } from '../../data/floors';
import {
  approveProposal, declineProposal, dismissStaff, setStaffArea, hireApplicant, MAX_STAFF, openProposals, refreshApplicants, setStaffRole, snoozeProposal,
  staffStatus, totalWages,
} from '../../sim/staff';
import type { StaffApplicant, StaffProposal, StaffRole, StaffSkills } from '../../sim/types';
import { h, meter } from '../dom';
import type { MenuItem } from '../menu';
import { helpItem } from './help';
import { locked } from './locks';

function skillRows(sk: StaffSkills): HTMLElement[] {
  return (Object.keys(SKILL_LABEL) as Array<keyof StaffSkills>).map((k) =>
    h('div', { class: 'row' }, h('span', null, SKILL_LABEL[k]), meter(sk[k] / 100, sk[k] >= 65 ? 'good' : sk[k] >= 40 ? 'blue' : 'warn'), h('span', null, `${Math.round(sk[k])}`)),
  );
}

function personalityEl(id: StaffApplicant['personality']): HTMLElement {
  const p = getPersonality(id);
  return h(
    'div',
    null,
    h('div', null, h('b', null, p.label), `: ${p.blurb}`),
    h('div', { class: 'small good' }, `+ ${p.strengths.join(', ')}`),
    h('div', { class: 'small warn' }, `- ${p.weaknesses.join(', ')}`),
  );
}

/** The team: staff list, hiring, suggestions. Opened from the office PC. */
export function openStaffHub(c: GameController): void {
  const s = c.state;
  const items = (): MenuItem[] => {
    const list: MenuItem[] = [{ label: `Team (${s.staff.length}/${MAX_STAFF})`, header: true }];
    for (const m of s.staff) {
      list.push({ label: `${m.name} · ${getRole(m.role).label}`, right: `${formatMoney(m.wage)}/day`, hint: staffStatus(s, m), action: () => openStaffMember(c, m.id, () => scr.refresh(items())) });
    }
    if (!s.staff.length) list.push({ label: 'No staff yet', disabled: true, hint: 'Hire someone to help with tanks, customers and stock.' });
    const props = openProposals(s);
    list.push({ label: 'Actions', header: true });
    list.push({ label: `Suggestions (${props.length})`, hint: 'Ideas your staff want you to approve: stock orders and aquascape changes. Nothing is bought without your approval.', action: () => openProposalList(c, () => scr.refresh(items())) });
    list.push(locked(c, 'staff', { label: 'Hire staff', right: `${s.applicants.list.length} applicants`, hint: 'See who has applied: skills, personality, wage.', disabled: s.staff.length >= MAX_STAFF, action: () => openApplicants(c, () => scr.refresh(items())) }));
    list.push(helpItem('staff_roles', 'Help: staff roles and skills'));
    list.push({ label: 'Back', action: () => c.ui.remove(scr) });
    return list;
  };
  const scr = c.ui.menu({
    title: 'Staff',
    body: () => h('div', null, h('div', { class: 'row' }, h('span', null, 'Daily wages'), h('b', null, formatMoney(totalWages(s)))), h('div', { class: 'small' }, 'Staff work 08:30 to 18:30. Wages are paid every night with the rent.')),
    items: items(),
    className: 'wide tall',
  });
}

export function openApplicants(c: GameController, done?: () => void): void {
  const s = c.state;
  refreshApplicants(s, c.sim!.rng);
  const items = (): MenuItem[] => {
    const list: MenuItem[] = s.applicants.list.map((a) => ({
      label: `${a.name} · ${getPersonality(a.personality).label}`,
      right: `${formatMoney(a.wage)}/day`,
      hint: `Cleaning ${a.skills.cleaning} · Service ${a.skills.service} · Speed ${a.skills.speed} · Knowledge ${a.skills.knowledge}`,
      action: () => openApplicant(c, a, () => {
        scr.refresh(items());
        done?.();
      }),
    }));
    if (!list.length) list.push({ label: 'No applicants right now', disabled: true, hint: 'New people apply every few days.' });
    list.push({ label: 'Back', action: () => c.ui.remove(scr) });
    return list;
  };
  const scr = c.ui.menu({ title: 'Applicants', body: h('div', { class: 'small' }, 'New applicants every 3 days. Better people apply as the shop grows.'), items: items(), className: 'wide' });
}

function openApplicant(c: GameController, a: StaffApplicant, done: () => void): void {
  const s = c.state;
  const hire = (role: StaffRole) => {
    const r = c.perform(hireApplicant(s, a.id, role));
    if (r.ok) {
      c.ui.remove(scr);
      done();
    }
  };
  const scr = c.ui.menu({
    title: a.name,
    body: h('div', null, personalityEl(a.personality), ...skillRows(a.skills), h('div', { class: 'row' }, h('span', null, 'Wage'), h('b', null, `${formatMoney(a.wage)} per day`)), h('div', { class: 'small' }, `"${a.intro}"`)),
    items: [
      { label: 'Hire as', header: true },
      ...ROLES.map((r) => locked(c, 'staff', { label: r.label, right: r.keySkills.map((k) => `${SKILL_LABEL[k]} ${a.skills[k]}`).join(' · '), hint: r.blurb, action: () => hire(r.id) })),
      { label: 'Back', action: () => c.ui.remove(scr) },
    ],
    className: 'wide',
  });
}

export function openStaffMember(c: GameController, staffId: string, done?: () => void): void {
  const s = c.state;
  const m = () => s.staff.find((x) => x.id === staffId);
  if (!m()) return;
  const cycleRole = (d: number) => {
    const cur = m()!;
    const i = ROLES.findIndex((r) => r.id === cur.role);
    c.perform(setStaffRole(s, staffId, ROLES[(i + d + ROLES.length) % ROLES.length].id), true);
    scr.refresh(items());
    done?.();
  };
  const items = (): MenuItem[] => {
    const cur = m();
    if (!cur) return [{ label: 'Back', action: () => c.ui.remove(scr) }];
    const mine = openProposals(s).filter((p) => p.staffId === staffId);
    const areas: Array<string | null> = [null, ...s.unlocks.floors];
    const cycleArea = (d: number) => {
      const i = Math.max(0, areas.indexOf(cur.assignedFloor ?? null));
      c.perform(setStaffArea(s, staffId, areas[(i + d + areas.length) % areas.length]), true);
      scr.refresh(items());
    };
    return [
      locked(c, 'staff', { label: 'Role', right: getRole(cur.role).label, hint: `${getRole(cur.role).blurb} Left / Right to change.`, onLeft: () => cycleRole(-1), onRight: () => cycleRole(1), action: () => cycleRole(1) }),
      locked(c, 'staff', { label: 'Works on', right: cur.assignedFloor ? getFloorLayout(cur.assignedFloor).name : 'Any floor', hint: 'Left / Right: keep them to one floor, or let them go anywhere they are needed.', onLeft: () => cycleArea(-1), onRight: () => cycleArea(1), action: () => cycleArea(1) }),
      ...mine.map((p) => ({ label: `Suggestion: ${p.title}`, hint: p.reason, action: () => openProposal(c, p.id, () => scr.refresh(items())) })),
      locked(c, 'staff', {
        label: 'Dismiss',
        hint: `Pays one final day's wage (${formatMoney(cur.wage)}).`,
        action: () => void c.ui.confirm(`Let ${cur.name} go? They get one final day's pay.`).then((y) => {
          if (!y) return;
          c.perform(dismissStaff(s, staffId));
          c.ui.remove(scr);
          done?.();
        }),
      }),
      { label: 'Back', action: () => c.ui.remove(scr) },
    ];
  };
  const body = () => {
    const cur = m();
    if (!cur) return h('div', null, 'They have left.');
    return h(
      'div',
      null,
      h('div', { class: 'row' }, h('span', null, staffStatus(s, cur)), h('span', null, `${formatMoney(cur.wage)}/day`)),
      personalityEl(cur.personality),
      ...skillRows(cur.skills),
      h('div', { class: 'small' }, `Hired day ${cur.hiredDay} · ${cur.stats.tasksDone} tank jobs · ${cur.stats.customersHelped} customers helped · ${cur.stats.sales} sales · ${cur.stats.proposals} suggestions. Skills improve slowly with practice.`),
    );
  };
  const scr = c.ui.menu({ title: m()!.name, body, items: items(), className: 'wide' });
}

function proposalBody(c: GameController, p: StaffProposal): HTMLElement {
  const s = c.state;
  const who = s.staff.find((x) => x.id === p.staffId);
  const rows: Array<HTMLElement | null> = [h('div', { class: 'small' }, `From ${who?.name ?? 'a former employee'} (knowledge ${Math.round(who?.skills.knowledge ?? 0)})`)];
  if (p.stock) {
    const sp = getSpecies(p.stock.speciesId);
    const sup = s.suppliers[p.stock.supplierId];
    rows.push(
      h('div', { class: 'row' }, h('span', null, 'Species'), h('b', null, `${p.stock.quantity} x ${sp.commonName}`)),
      h('div', { class: 'row' }, h('span', null, 'Supplier'), h('span', null, sup ? p.stock.supplierId : '?')),
      h('div', { class: 'row' }, h('span', null, 'Destination'), h('span', null, s.tanks[p.stock.tankId]?.name ?? '?')),
      h('div', { class: 'row' }, h('span', null, 'Cost'), h('b', null, formatMoney(p.stock.quantity * p.stock.unitCost))),
    );
  }
  if (p.aquascape) {
    rows.push(
      h('div', { class: 'row' }, h('span', null, 'Item'), h('b', null, getDecor(p.aquascape.defId).name)),
      h('div', { class: 'row' }, h('span', null, 'Tank'), h('span', null, s.tanks[p.aquascape.tankId]?.name ?? '?')),
      h('div', { class: 'row' }, h('span', null, 'Cost'), h('b', null, formatMoney(p.aquascape.cost))),
    );
  }
  rows.push(h('div', { class: 'small' }, `Why: ${p.reason}`));
  for (const w of p.warnings) rows.push(h('div', { class: 'small warn' }, `⚠ ${w}`));
  if (!p.warnings.length && p.stock) rows.push(h('div', { class: 'small good' }, 'No problems spotted with this order.'));
  return h('div', null, ...rows);
}

export function openProposal(c: GameController, id: string, done?: () => void): void {
  const s = c.state;
  const p = s.proposals.find((x) => x.id === id);
  if (!p) return;
  const finish = () => {
    c.ui.remove(scr);
    done?.();
  };
  const editQty = (d: number) => {
    if (!p.stock) return;
    const sup = s.suppliers[p.stock.supplierId]?.stock.find((x) => x.speciesId === p.stock!.speciesId);
    p.stock.quantity = Math.max(1, Math.min(sup?.available ?? p.stock.quantity, p.stock.quantity + d));
    p.title = p.title.replace(/^Order \d+/, `Order ${p.stock.quantity}`);
    scr.renderBody();
    scr.refresh(items());
  };
  const items = (): MenuItem[] => [
      locked(c, 'approve', { label: 'Approve', hint: p.stock ? 'Places the order now (paid now, delivered at opening).' : 'Buys and places the item now.', action: () => { if (c.perform(approveProposal(s, id)).ok) finish(); } }),
      ...(p.stock ? [locked(c, 'approve', { label: 'Edit quantity', right: `${p.stock.quantity}`, hint: 'Left / Right to change how many to order.', onLeft: () => editQty(-1), onRight: () => editQty(1) })] : []),
      { label: 'Not now', hint: 'They will bring it up again later. It stays in Suggestions at the PC.', action: () => { snoozeProposal(s, id); finish(); } },
      { label: 'Decline', action: () => { declineProposal(s, id); finish(); } },
      { label: 'Back', action: () => c.ui.remove(scr) },
  ];
  const scr = c.ui.menu({ title: p.title, body: () => proposalBody(c, p), items: items(), className: 'wide' });
}

export function openProposalList(c: GameController, done?: () => void): void {
  const s = c.state;
  const items = (): MenuItem[] => {
    const list: MenuItem[] = openProposals(s).map((p) => ({
      label: `${p.warnings.length ? '⚠ ' : ''}${p.title}`,
      right: p.status === 'snoozed' ? 'later' : p.stock ? formatMoney(p.stock.quantity * p.stock.unitCost) : p.aquascape ? formatMoney(p.aquascape.cost) : '',
      hint: p.reason,
      action: () => openProposal(c, p.id, () => { scr.refresh(items()); done?.(); }),
    }));
    if (!list.length) list.push({ label: 'No suggestions right now', disabled: true, hint: 'Stock staff suggest orders; knowledgeable maintenance staff suggest aquascape fixes.' });
    list.push(helpItem('staff_suggestions'));
    list.push({ label: 'Back', action: () => c.ui.remove(scr) });
    return list;
  };
  const scr = c.ui.menu({ title: 'Staff suggestions', items: items(), className: 'wide' });
}

/** A staff member walked up with a suggestion: Approve / Review / Not now. */
export async function showProposalPrompt(c: GameController, p: StaffProposal): Promise<void> {
  const s = c.state;
  const who = s.staff.find((x) => x.id === p.staffId);
  if (!who || p.status !== 'pending') return;
  const warn = p.warnings.length ? ` (${p.warnings.length} warning${p.warnings.length > 1 ? 's' : ''})` : '';
  const choices = p.kind === 'aquascape' ? ['Go ahead', 'Show me', 'Leave it'] : ['Approve order', 'Review order', 'Not now'];
  const i = await c.ui.ask(who.name, `${p.title}?${warn} ${p.reason}`, choices);
  if (i === 0) {
    const blocked = c.lockReason('approve');
    if (blocked) c.ui.toast(blocked, 'warn');
    else c.perform(approveProposal(s, p.id));
  } else if (i === 1) openProposal(c, p.id);
  else snoozeProposal(s, p.id);
}
