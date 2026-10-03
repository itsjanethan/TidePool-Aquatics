/**
 * StaffSystem: hired employees are persistent entities that walk the floors
 * and do real work through the same sim functions the player uses. They
 * never spend money on their own: stock orders and aquascape purchases are
 * proposals the player approves (see proposals below).
 *
 * - Maintenance staff pick jobs from the tank diagnostics, by severity.
 * - Sales staff serve the till when the player is away and answer questions.
 *   Knowledge decides whether advice is right; service decides how happy the
 *   customer is and how quickly it goes.
 * - Stock staff turn real demand and tank suitability into order proposals.
 * - Floaters go where they are needed most.
 * Skills grow slowly with practice; personality shapes the trade-offs.
 */
import { clamp, round } from '../core/math';
import type { Rng } from '../core/rng';
import { getDecor } from '../data/catalog';
import { findProp, floorOfTank, GROUND } from '../data/floors';
import { getSpecies, SPECIES } from '../data/species';
import { getPersonality, PERSONALITIES, STAFF_FIRST, STAFF_LINES } from '../data/staff';
import { summarizeAquascape } from './aquascape';
import { assessSpeciesForSetup } from './compat';
import {
  checkoutQuote, completeSale, customerFloor, equipmentCovers, equipmentOptions, inStockSpecies, resolveEquipmentAdvice, nearestFreeNeighbour, offerAddOn, problemFor, queueCustomers,
  resolveAdvice, resolveProblem, type CustomerContext,
} from './customers';
import { demandFor, spend } from './economy';
import { fishInTank, newId } from './fish';
import { idleRefusal } from './idle';
import { lineWarnings, outstandingLines, projectedStocking } from './orderCheck';
import { FIXES, type FixId } from './preview';
import { getSupplier, placeOrder, suppliersFor } from './supplier';

const SUPPLIERS_BY_ID = (id: string) => {
  try {
    return getSupplier(id);
  } catch {
    return null;
  }
};
import { addDecor, feedTank, type ActionResult } from './tank';
import { caveSuggestions, coverSuggestions, diagnoseTank } from './tankDiagnostics';
import { coverPercent } from './habitat';
import { dayOf, minuteOfDay } from './time';
import type { CustomerState, GameState, Personality, StaffApplicant, StaffEntity, StaffProposal, StaffRole, StaffSkills } from './types';
import { faceToward, floorOfWalker, hopStairs, stepPath, walkTo, type GridLookup } from './walker';

export const STAFF_START = 8 * 60 + 30;
export const STAFF_END = 18 * 60 + 30;
export const MAX_STAFF = 6;
export const APPLICANT_DAYS = 3;
/** Base minutes for each job before speed and personality. */
export const JOB_MINUTES: Record<FixId, number> = { feed: 3, water25: 20, water50: 30, glass: 8, algae: 10, vacuum: 15, filter: 12, removeDead: 4, topoff: 6 };

export interface StaffContext {
  grids: GridLookup;
  customers: CustomerContext;
  rng: Rng;
  log: (text: string, kind: 'info' | 'good' | 'warn' | 'bad') => void;
  /** A staff member has reached the player with a proposal. */
  onProposal?: (p: StaffProposal) => void;
}

const ok = (message: string, minutes = 0): ActionResult => ({ ok: true, message, minutes });
const fail = (message: string): ActionResult => ({ ok: false, message, minutes: 0 });

export function isOnDuty(minute: number): boolean {
  const m = minuteOfDay(minute);
  return m >= STAFF_START && m < STAFF_END;
}

export function totalWages(state: GameState): number {
  return round(state.staff.reduce((s, m) => s + m.wage, 0), 2);
}

// ---------------------------------------------------------------------------
// Hiring

/** Daily wage from skills and personality. */
export function wageFor(skills: StaffSkills, personality: Personality): number {
  const avg = (skills.cleaning + skills.service + skills.speed + skills.knowledge) / 4;
  return round((12 + avg * 0.3) * getPersonality(personality).wageMul, 0);
}

export function rollApplicant(state: GameState, rng: Rng): StaffApplicant {
  const p = rng.pick(PERSONALITIES);
  // Better applicants turn up as the shop's reputation grows.
  const base = 22 + state.shopLevel * 6;
  const roll = (k: keyof StaffSkills) => clamp(Math.round(base + rng.range(-10, 22) + (p.bias[k] ?? 0)), 5, 90);
  const skills: StaffSkills = { cleaning: roll('cleaning'), service: roll('service'), speed: roll('speed'), knowledge: roll('knowledge') };
  const used = new Set([...state.staff.map((m) => m.name), ...state.applicants.list.map((a) => a.name)]);
  const names = STAFF_FIRST.filter((n) => !used.has(n));
  return {
    id: newId(state, 'ap'),
    name: rng.pick(names.length ? names : STAFF_FIRST),
    appearance: rng.int(0, 1_000_000),
    personality: p.id,
    skills,
    wage: wageFor(skills, p.id),
    intro: p.blurb,
  };
}

/** New applicants every few days. */
export function refreshApplicants(state: GameState, rng: Rng, force = false): void {
  const day = dayOf(state.minute);
  if (!force && state.applicants.list.length && day - state.applicants.day < APPLICANT_DAYS) return;
  state.applicants = { day, list: [] };
  for (let i = 0; i < 3; i++) state.applicants.list.push(rollApplicant(state, rng));
}

function bestRole(skills: StaffSkills): StaffRole {
  if (skills.service >= skills.cleaning && skills.service >= 45) return 'sales';
  if (skills.cleaning >= skills.knowledge) return 'maintenance';
  return 'stock';
}

export function hireApplicant(state: GameState, applicantId: string, role?: StaffRole): ActionResult {
  if (state.idle) return idleRefusal();
  const a = state.applicants.list.find((x) => x.id === applicantId);
  if (!a) return fail('That applicant is no longer available.');
  if (state.staff.length >= MAX_STAFF) return fail(`You can employ up to ${MAX_STAFF} staff.`);
  const door = GROUND.door ?? GROUND.playerStart;
  const m: StaffEntity = {
    id: newId(state, 's'),
    name: a.name,
    appearance: a.appearance,
    personality: a.personality,
    wage: a.wage,
    experience: 0,
    floor: GROUND.id,
    x: door.x,
    y: door.y - 1,
    path: [],
    pending: null,
    facing: 'up',
    walkPhase: 0,
    role: role ?? bestRole(a.skills),
    task: null,
    skills: { ...a.skills },
    hiredDay: dayOf(state.minute),
    dialogue: 'Thanks for having me!',
    dialogueUntil: state.minute + 30,
    stats: { tasksDone: 0, customersHelped: 0, proposals: 0, sales: 0 },
  };
  state.staff.push(m);
  state.applicants.list = state.applicants.list.filter((x) => x.id !== applicantId);
  return ok(`${m.name} joins the team as ${role ?? m.role} staff (${formatWage(m.wage)} a day).`);
}

export function formatWage(w: number): string {
  return `£${w.toFixed(0)}`;
}

/** Dismissal pays one day's wage. Pending proposals from them are dropped. */
export function dismissStaff(state: GameState, staffId: string): ActionResult {
  if (state.idle) return idleRefusal();
  const m = state.staff.find((x) => x.id === staffId);
  if (!m) return fail('No such employee.');
  spend(state, m.wage, `Final pay: ${m.name}`, true);
  for (const c of state.customers) if (c.helpedBy === m.id) c.helpedBy = null;
  state.staff = state.staff.filter((x) => x.id !== staffId);
  state.proposals = state.proposals.filter((p) => p.staffId !== staffId || p.status !== 'pending');
  return ok(`${m.name} has left. Final pay ${formatWage(m.wage)}.`);
}

/** Keep a member of staff to one floor (null = anywhere). */
export function setStaffArea(state: GameState, staffId: string, floor: string | null): ActionResult {
  if (state.idle) return idleRefusal();
  const m = state.staff.find((x) => x.id === staffId);
  if (!m) return fail('No such employee.');
  if (floor && !state.unlocks.floors.includes(floor)) return fail('That floor is not open yet.');
  m.assignedFloor = floor;
  releaseTask(state, m);
  return ok(`${m.name} now works ${floor ? `on the ${floor} floor` : 'anywhere in the shop'}.`);
}

export function setStaffRole(state: GameState, staffId: string, role: StaffRole): ActionResult {
  if (state.idle) return idleRefusal();
  const m = state.staff.find((x) => x.id === staffId);
  if (!m) return fail('No such employee.');
  m.role = role;
  releaseTask(state, m);
  return ok(`${m.name} is now on ${role}.`);
}

// ---------------------------------------------------------------------------
// Skills

/** Practice: slow growth, faster for eager learners, capped at 95. */
export function practise(m: StaffEntity, skill: keyof StaffSkills, amount = 1): void {
  const p = getPersonality(m.personality);
  m.experience += amount;
  m.skills[skill] = Math.min(95, m.skills[skill] + amount * 0.05 * p.learn * (1 - m.skills[skill] / 120));
}

/** Multiplier on job time from speed skill and personality. */
export function jobTimeFactor(m: StaffEntity): number {
  return getPersonality(m.personality).taskTime * (1.35 - m.skills.speed / 100 * 0.7);
}

/** Share of a cleaning job actually achieved. */
export function thoroughness(m: StaffEntity): number {
  return clamp((0.62 + m.skills.cleaning / 100 * 0.4) * getPersonality(m.personality).thoroughness, 0.4, 1);
}

/** Chance of getting advice right. */
export function adviceAccuracy(m: StaffEntity): number {
  return clamp(0.15 + m.skills.knowledge / 100 * 0.85, 0.1, 0.97);
}

/** A line from the employee's own pool when they have one, else the shared pool. */
function line(rng: Rng, m: StaffEntity, key: keyof typeof STAFF_LINES): string {
  const own = getPersonality(m.personality).lines?.[key];
  return rng.pick(own && rng.chance(0.6) ? own : STAFF_LINES[key]);
}

function say(state: GameState, m: StaffEntity, text: string, minutes = 8): void {
  m.dialogue = text;
  m.dialogueUntil = state.minute + minutes;
}

function releaseTask(state: GameState, m: StaffEntity): void {
  if (m.task?.customerId) {
    const c = state.customers.find((x) => x.id === m.task!.customerId);
    if (c?.helpedBy === m.id) c.helpedBy = null;
  }
  m.task = null;
  m.path = [];
  m.pending = null;
}

// ---------------------------------------------------------------------------
// Job choice

const SEV_WEIGHT = { critical: 100, warning: 50, advice: 10 };
/** Jobs a role may take, in no particular order. */
const ROLE_FIXES: Record<StaffRole, FixId[]> = {
  maintenance: ['removeDead', 'water50', 'water25', 'topoff', 'feed', 'filter', 'vacuum', 'algae', 'glass'],
  floater: ['removeDead', 'water50', 'water25', 'topoff', 'feed', 'filter', 'vacuum', 'algae', 'glass'],
  stock: ['removeDead', 'feed'],
  sales: ['removeDead'],
};

export interface JobChoice {
  tankId: string;
  fix: FixId;
  issueId: string;
  score: number;
}

/** Ranked maintenance jobs from diagnostics (best first), skipping tanks other staff are on. */
export function maintenanceJobs(state: GameState, role: StaffRole, exclude: Set<string> = new Set(), floor?: string | null): JobChoice[] {
  const allowed = new Set(ROLE_FIXES[role]);
  const jobs: JobChoice[] = [];
  for (const id of state.tankOrder) {
    if (exclude.has(id) || (floor && floorOfTank(id) !== floor)) continue;
    const r = diagnoseTank(state, state.tanks[id]);
    for (const issue of r.issues) {
      // Advice-level cleaning only when the tank is visibly grubby.
      if (issue.severity === 'advice' && !['glass', 'algae', 'waste'].includes(issue.id)) continue;
      const act = issue.actions.find((a) => a.fix && allowed.has(a.fix as FixId));
      if (!act) continue;
      jobs.push({ tankId: id, fix: act.fix as FixId, issueId: issue.id, score: SEV_WEIGHT[issue.severity] + (issue.id === 'dead' ? 60 : issue.id === 'hungry' ? 15 : 0) });
      break;
    }
  }
  return jobs.sort((a, b) => b.score - a.score);
}

function claimedTanks(state: GameState, except: StaffEntity): Set<string> {
  return new Set(state.staff.filter((m) => m !== except && m.task?.tankId).map((m) => m.task!.tankId!));
}

function startMaintenance(state: GameState, ctx: StaffContext, m: StaffEntity): boolean {
  const jobs = maintenanceJobs(state, m.role, claimedTanks(state, m), m.assignedFloor);
  if (!jobs.length) return false;
  // Less knowledgeable staff sometimes pick a less urgent job first.
  let job = jobs[0];
  if (jobs.length > 1 && ctx.rng.chance((1 - m.skills.knowledge / 100) * 0.35)) job = jobs[1];
  const prop = findProp(job.tankId);
  if (!prop?.prop.interact?.length) return false;
  const tile = ctx.rng.pick(prop.prop.interact);
  if (!walkTo(state, ctx.grids, m, prop.floor, tile)) return false;
  m.task = { kind: 'maintain', tankId: job.tankId, fix: job.fix, label: `${FIXES[job.fix].label}: ${state.tanks[job.tankId].name}` };
  if (ctx.rng.chance(0.3)) say(state, m, line(ctx.rng, m, 'onIt'), 5);
  return true;
}

function finishMaintenance(state: GameState, ctx: StaffContext, m: StaffEntity): void {
  const t = state.tanks[m.task!.tankId!];
  const fix = m.task!.fix as FixId;
  if (!t) return;
  const before = { glass: t.glassDirt, algae: t.algae, detritus: t.water.detritus };
  // Inexperienced staff occasionally overfeed.
  const res = fix === 'feed' && m.skills.knowledge < 30 && ctx.rng.chance(0.15) ? feedTank(state, t, 'heavy') : FIXES[fix].run(state, t);
  if (!res.ok) {
    if (fix === 'feed') say(state, m, STAFF_LINES.noFood[0], 10);
    return;
  }
  // Cleaning jobs are only as good as the person doing them.
  const th = thoroughness(m);
  if (fix === 'glass') t.glassDirt += (before.glass - t.glassDirt) * (1 - th);
  if (fix === 'algae') t.algae += (before.algae - t.algae) * (1 - th);
  if (fix === 'vacuum') t.water.detritus += (before.detritus - t.water.detritus) * (1 - th);
  m.stats.tasksDone += 1;
  practise(m, 'cleaning', fix === 'feed' ? 0.3 : 1);
  practise(m, 'speed', 0.3);
  if (ctx.rng.chance(0.25)) say(state, m, line(ctx.rng, m, 'done'), 5);
}

// ---------------------------------------------------------------------------
// Customers

function playerAtTill(state: GameState): boolean {
  const till = GROUND.till!;
  return state.player.floor === GROUND.id && Math.hypot(state.player.x - till.x, state.player.y - till.y) < 2.5;
}

function startTill(state: GameState, ctx: StaffContext, m: StaffEntity): boolean {
  if (playerAtTill(state)) return false;
  const q = queueCustomers(state).filter((c) => c.phase === 'queueing');
  if (!q.length) return false;
  if (state.staff.some((o) => o !== m && o.task?.kind === 'serve')) return false;
  if (!walkTo(state, ctx.grids, m, GROUND.id, GROUND.till!)) return false;
  m.task = { kind: 'serve', label: 'Serving at the till' };
  return true;
}

/** At the till: serve whoever is at the front. */
function workTill(state: GameState, ctx: StaffContext, m: StaffEntity): void {
  const spot = GROUND.queue[0];
  const front = queueCustomers(state)[0];
  if (playerAtTill(state)) {
    releaseTask(state, m);
    return;
  }
  if (!front || front.phase !== 'queueing' || Math.round(front.x) !== spot.x || Math.round(front.y) !== spot.y) {
    if (!front) releaseTask(state, m);
    return;
  }
  m.facing = 'down';
  if (m.task!.until === undefined) {
    front.helpedBy = m.id;
    const p = getPersonality(m.personality);
    const minutes = (4 + checkoutQuote(state, front).lines.length * 1.2) * jobTimeFactor(m) * (m.skills.service < 30 ? 1.3 : 1) * (ctx.rng.chance(p.chatty) ? 1.6 : 1);
    m.task!.until = state.minute + minutes;
    m.task!.customerId = front.id;
    return;
  }
  if (state.minute < m.task!.until) return;
  // A good salesperson may suggest the right extras.
  if (ctx.rng.chance(m.skills.service / 260) && (state.dryGoods.conditioner ?? 0) > 0) offerAddOn(state, front, 'conditioner', ctx.rng);
  front.satisfaction += (m.skills.service - 50) / 8;
  const total = checkoutQuote(state, front).total;
  front.helpedBy = null;
  const sale = completeSale(state, ctx.customers, front, total);
  m.stats.sales += 1;
  m.stats.customersHelped += 1;
  practise(m, 'service', 1);
  if (sale.total > 0) ctx.log(`${m.name} served ${front.name} at the till (£${sale.total.toFixed(2)}).`, 'info');
  m.task!.until = undefined;
  m.task!.customerId = undefined;
}

function helpable(c: CustomerState): boolean {
  return (c.phase === 'seeking_help' || c.phase === 'waiting_help') && !c.helpedBy;
}

function startHelping(state: GameState, ctx: StaffContext, m: StaffEntity): boolean {
  const waiting = state.customers.filter((c) => helpable(c) && !state.staff.some((o) => o.task?.customerId === c.id) && (!m.assignedFloor || customerFloor(c) === m.assignedFloor));
  if (!waiting.length) return false;
  // Nearest on the same floor first, then anyone.
  waiting.sort((a, b) => (customerFloor(a) === m.floor ? 0 : 50) + Math.hypot(a.x - m.x, a.y - m.y) - ((customerFloor(b) === m.floor ? 0 : 50) + Math.hypot(b.x - m.x, b.y - m.y)));
  const c = waiting[0];
  const floor = customerFloor(c);
  const tile = nearestFreeNeighbour(ctx.grids(floor), c.x, c.y, m.x, m.y);
  if (!tile || !walkTo(state, ctx.grids, m, floor, tile)) return false;
  m.task = { kind: 'advise', customerId: c.id, label: `Helping ${c.name}` };
  return true;
}

function workAdvice(state: GameState, ctx: StaffContext, m: StaffEntity): void {
  const c = state.customers.find((x) => x.id === m.task!.customerId);
  if (!c || (c.helpedBy && c.helpedBy !== m.id) || (c.phase !== 'seeking_help' && c.phase !== 'waiting_help')) {
    releaseTask(state, m);
    return;
  }
  if (Math.hypot(c.x - m.x, c.y - m.y) > 1.8 || customerFloor(c) !== floorOfWalker(m)) {
    // They moved: follow.
    releaseTask(state, m);
    return;
  }
  faceToward(m, c.x, c.y);
  if (m.task!.until === undefined) {
    c.helpedBy = m.id;
    c.phase = 'waiting_help';
    c.thought = null;
    const p = getPersonality(m.personality);
    m.task!.until = state.minute + 6 * jobTimeFactor(m) * (ctx.rng.chance(p.chatty) ? 1.7 : 1);
    say(state, m, line(ctx.rng, m, 'customer'), 4);
    return;
  }
  if (state.minute < m.task!.until) return;
  c.satisfaction += (m.skills.service - 50) / 6;
  const acc = adviceAccuracy(m);
  const right = ctx.rng.chance(acc);
  c.helpedBy = null;
  let result: { reply: string; success: boolean };
  if (c.goal === 'buy_equipment') {
    // Right: the cheapest option that covers the need (bundles first). Wrong: a plausible mismatch.
    const opts = equipmentOptions(state, c);
    const good = opts.filter((o) => equipmentCovers(c, o.items));
    const bad = opts.filter((o) => !equipmentCovers(c, o.items));
    const pick = right ? good[0] : (bad[0] ?? good[0]);
    result = resolveEquipmentAdvice(state, ctx.customers, c, pick ? pick.items : null);
  } else if (c.goal === 'advice_stocking') {
    const setup = { litres: c.goalData.tankLitres ?? 60, heated: !!c.goalData.heated };
    const stock = inStockSpecies(state);
    const ranked = stock.map((s) => ({ s, score: assessSpeciesForSetup(s, setup).score })).sort((a, b) => b.score - a.score);
    const pick = right ? (ranked[0] && ranked[0].score >= 0.75 ? ranked[0].s : null) : stock.length ? ctx.rng.pick(stock) : null;
    result = resolveAdvice(state, ctx.customers, c, pick);
  } else {
    const prob = problemFor(c);
    const correct = prob.options.findIndex((o) => o.correct);
    const wrong = prob.options.map((_, i) => i).filter((i) => i !== correct);
    result = resolveProblem(state, ctx.customers, c, right || !wrong.length ? correct : ctx.rng.pick(wrong));
  }
  m.stats.customersHelped += 1;
  practise(m, 'knowledge', 0.8);
  practise(m, 'service', 0.6);
  ctx.log(`${m.name} helped ${c.name}: ${result.success ? 'good advice' : 'it did not go well'}.`, result.success ? 'info' : 'warn');
  releaseTask(state, m);
}

// ---------------------------------------------------------------------------
// Proposals

/** Order suggestion from real demand, stock levels and tank suitability. Knowledge decides how sensible it is. */
export function makeStockProposal(state: GameState, rng: Rng, m: StaffEntity): StaffProposal | null {
  const knowledge = m.skills.knowledge / 100;
  const inShop = new Map<string, number>();
  for (const f of Object.values(state.fish)) if (f.alive && f.tankId) inShop.set(f.speciesId, (inShop.get(f.speciesId) ?? 0) + 1);
  const options: Array<{ sid: string; supplierId: string; unitCost: number; score: number }> = [];
  for (const sup of suppliersFor(state)) {
    for (const st of state.suppliers[sup.id]?.stock ?? []) {
      if (st.available <= 0 || !speciesAvailable(state, st.speciesId)) continue;
      const sp = getSpecies(st.speciesId);
      const have = inShop.get(st.speciesId) ?? 0;
      const scarcity = have < sp.minGroupSize ? 1.6 : have < 12 ? 1.1 : 0.5;
      const margin = sp.retailPrice / Math.max(0.1, st.unitCost);
      options.push({ sid: st.speciesId, supplierId: sup.id, unitCost: st.unitCost, score: demandFor(state, st.speciesId) * scarcity * Math.min(3, margin) * rng.range(0.85, 1.15) });
    }
  }
  if (!options.length) return null;
  options.sort((a, b) => b.score - a.score);
  // Sharper staff look at the best opportunities; others pick from a wider list.
  const pickFrom = options.slice(0, Math.max(1, Math.round(1 + (1 - knowledge) * 5)));
  const opt = rng.pick(pickFrom);
  const sp = getSpecies(opt.sid);
  const tanks = state.tankOrder
    .filter((id) => state.tanks[id].forSale !== false && (state.tanks[id].waterType ?? 'freshwater') === sp.waterType)
    .map((id) => {
      const t = state.tanks[id];
      const resident = [...new Set([...fishInTank(state, id).map((f) => f.speciesId), ...outstandingLines(state, id).map((l) => l.speciesId)])];
      const res = assessSpeciesForSetup(sp.id, { litres: t.litres, lengthCm: t.lengthCm, heated: !!t.heaterId, temperature: t.water.temperature, residentSpecies: resident, waterType: t.waterType ?? 'freshwater' });
      // Count livestock already on order too, so staff do not pile a second order onto the same tank.
      return { id, score: res.score - projectedStocking(state, id, []) * 0.4 };
    })
    .sort((a, b) => b.score - a.score);
  if (!tanks.length) return null;
  const good = tanks.filter((t) => t.score >= 0.55);
  // Knowledgeable staff choose the best home; others sometimes pick a poor one (and the warnings will say so).
  const dest = rng.chance(knowledge) || !tanks.length ? (good[0] ?? tanks[0]) : rng.pick(tanks.slice(0, 4));
  let qty = Math.max(sp.minGroupSize, 2);
  while (qty < 12 && projectedStocking(state, dest.id, [{ speciesId: sp.id, quantity: qty + 1, tankId: dest.id }]) < 0.85) qty++;
  const sup = state.suppliers[opt.supplierId].stock.find((x) => x.speciesId === sp.id)!;
  // Leave room for anything already suggested from the same supplier stock.
  const pending = openProposals(state).filter((p) => p.stock?.supplierId === opt.supplierId && p.stock.speciesId === sp.id).reduce((n, p) => n + p.stock!.quantity, 0);
  qty = Math.min(qty, sup.available - pending);
  // Meet the supplier's minimum order.
  const minOrder = SUPPLIERS_BY_ID(opt.supplierId)?.minOrder ?? 0;
  while (qty * opt.unitCost < minOrder && qty < sup.available - pending && qty < 20) qty++;
  if (qty <= 0 || qty * opt.unitCost < minOrder) return null;
  const cost = round(qty * opt.unitCost, 2);
  if (state.money < cost + 60) return null;
  const line = { speciesId: sp.id, quantity: qty, tankId: dest.id };
  const warnings = lineWarnings(state, line, [line]).filter((w) => w.severity === 'warn').map((w) => w.text);
  const have = inShop.get(sp.id) ?? 0;
  const t = state.tanks[dest.id];
  const demand = demandFor(state, sp.id);
  return {
    id: newId(state, 'pr'),
    staffId: m.id,
    kind: 'stock',
    createdMinute: state.minute,
    status: 'pending',
    delivered: false,
    title: `Order ${qty} ${sp.commonName} for ${t.name}`,
    reason: `${have ? `We only have ${have} ${sp.commonName} left` : `We have no ${sp.commonName}`} and demand is ${demand >= 1 ? 'good' : 'soft'}. ${t.name} is ${t.litres}L at ${t.water.temperature.toFixed(0)}°C. They sell for about £${sp.retailPrice.toFixed(2)}; cost £${opt.unitCost.toFixed(2)} each.`,
    warnings,
    stock: { speciesId: sp.id, quantity: qty, supplierId: opt.supplierId, tankId: dest.id, unitCost: opt.unitCost },
  };
}

/** Species the shop may stock at its current level. */
export function speciesAvailable(state: GameState, speciesId: string): boolean {
  const sp = SPECIES.find((s) => s.id === speciesId);
  if (!sp) return false;
  return (sp.shopLevel ?? 1) <= state.shopLevel || state.unlocks.species.includes(speciesId);
}

/** Habitat fix suggestion: a decor item for a tank lacking cover or caves. The real sim predicts the effect. */
export function makeAquascapeProposal(state: GameState, rng: Rng, m: StaffEntity): StaffProposal | null {
  for (const id of rng.shuffle([...state.tankOrder])) {
    const t = state.tanks[id];
    const r = diagnoseTank(state, t);
    const issue = r.issues.find((i) => i.id === 'cover' || i.id === 'caves');
    if (!issue) continue;
    const sugg = issue.id === 'cover' ? coverSuggestions(t, 3).map((s) => s.defId) : caveSuggestions(3, t).map((s) => s.defId);
    if (!sugg.length) continue;
    // Knowledgeable staff pick the most effective item, others any of the three.
    const defId = rng.chance(m.skills.knowledge / 100) ? sugg[0] : rng.pick(sugg);
    const def = getDecor(defId);
    if (state.money < def.cost + 40) return null;
    const x = emptiestSpot(t, rng);
    const layer: 0 | 1 | 2 = def.kind === 'plant' ? 0 : 1;
    const pred = predictDecor(state, id, defId, x, layer);
    return {
      id: newId(state, 'pr'),
      staffId: m.id,
      kind: 'aquascape',
      createdMinute: state.minute,
      status: 'pending',
      delivered: false,
      title: `Add ${def.name} to ${t.name}`,
      reason: `${issue.title}. ${pred}`,
      warnings: [],
      aquascape: { tankId: id, defId, x, layer, cost: def.cost, fixes: issue.id },
    };
  }
  return null;
}

function emptiestSpot(t: GameState['tanks'][string], rng: Rng): number {
  let best = 0.5;
  let bestGap = -1;
  for (let i = 0; i < 8; i++) {
    const x = 0.1 + rng.next() * 0.8;
    const gap = Math.min(1, ...t.decor.map((d) => Math.abs(d.x - x)));
    if (gap > bestGap) {
      bestGap = gap;
      best = x;
    }
  }
  return round(best, 2);
}

/** Runs the real addDecor on a copy and reports cover/caves before → after. */
export function predictDecor(state: GameState, tankId: string, defId: string, x: number, layer: 0 | 1 | 2): string {
  const clone: GameState = structuredClone(state);
  clone.idle = false;
  clone.money = Math.max(clone.money, 1e6);
  const t = clone.tanks[tankId];
  const before = summarizeAquascape(t);
  const needs = diagnoseTank(clone, t).needs;
  addDecor(clone, t, defId, x, layer);
  const after = summarizeAquascape(t);
  return `Hiding cover ${coverPercent(before)}% → ${coverPercent(after)}% (${needs.coverPct}% recommended) · Cave spaces ${before.caveSlots} → ${after.caveSlots} (${needs.caveSlots} needed).`;
}

export function approveProposal(state: GameState, proposalId: string): ActionResult {
  if (state.idle) return idleRefusal();
  const p = state.proposals.find((x) => x.id === proposalId);
  if (!p || p.status === 'approved' || p.status === 'declined') return fail('That suggestion is no longer open.');
  let res: ActionResult;
  if (p.stock) {
    const r = placeOrder(state, p.stock.supplierId, [{ speciesId: p.stock.speciesId, quantity: p.stock.quantity, tankId: p.stock.tankId }], dayOf(state.minute));
    res = { ok: r.ok, message: r.message, minutes: 0 };
    // The supplier sold out since: the suggestion is withdrawn rather than left open.
    if (!r.ok && /in stock|minimum/.test(r.message)) {
      p.status = 'declined';
      res.message = `${r.message} The suggestion has been withdrawn.`;
    }
  } else if (p.aquascape) {
    const t = state.tanks[p.aquascape.tankId];
    res = t ? addDecor(state, t, p.aquascape.defId, p.aquascape.x, p.aquascape.layer) : fail('That tank is gone.');
  } else res = fail('Nothing to approve.');
  if (res.ok) p.status = 'approved';
  return res;
}

export function declineProposal(state: GameState, proposalId: string): void {
  const p = state.proposals.find((x) => x.id === proposalId);
  if (p) p.status = 'declined';
}

/** "Not now": the staff member will bring it up again later (at the PC meanwhile). */
export function snoozeProposal(state: GameState, proposalId: string, minutes = 120): void {
  const p = state.proposals.find((x) => x.id === proposalId);
  if (!p) return;
  p.status = 'snoozed';
  p.snoozeUntil = state.minute + minutes;
}

export function openProposals(state: GameState): StaffProposal[] {
  return state.proposals.filter((p) => p.status === 'pending' || p.status === 'snoozed');
}

function maybePropose(state: GameState, ctx: StaffContext, m: StaffEntity): boolean {
  const mine = openProposals(state).filter((p) => p.staffId === m.id);
  if (mine.length >= 3) return false;
  // Stock staff check stock every couple of hours; others only now and then.
  const since = state.minute - Math.max(0, ...state.proposals.filter((p) => p.staffId === m.id).map((p) => p.createdMinute));
  if (since < (m.role === 'stock' ? 120 : 300)) return false;
  let p: StaffProposal | null = null;
  if (m.role === 'stock' || (m.role === 'floater' && ctx.rng.chance(0.3))) p = makeStockProposal(state, ctx.rng, m);
  else if (m.role === 'maintenance' && m.skills.knowledge >= 35 && ctx.rng.chance(0.25)) p = makeAquascapeProposal(state, ctx.rng, m);
  if (!p) return false;
  // Do not repeat an identical open suggestion.
  if (openProposals(state).some((o) => o.title === p!.title)) return false;
  state.proposals.push(p);
  if (state.proposals.length > 40) state.proposals.splice(0, state.proposals.length - 40);
  m.stats.proposals += 1;
  practise(m, 'knowledge', 0.5);
  m.task = { kind: 'propose', proposalId: p.id, label: 'Looking for you with a suggestion', until: state.minute + 40 };
  say(state, m, line(ctx.rng, m, 'proposal'), 6);
  return true;
}

/** Walks to the player; on arrival the proposal is "delivered" and the UI asks for a decision. */
function workProposal(state: GameState, ctx: StaffContext, m: StaffEntity): void {
  const p = state.proposals.find((x) => x.id === m.task!.proposalId);
  if (!p || p.status !== 'pending' || p.delivered) {
    releaseTask(state, m);
    return;
  }
  if (state.minute > (m.task!.until ?? 0)) {
    // Could not find you: it waits at the office PC.
    releaseTask(state, m);
    return;
  }
  const near = state.player.floor === floorOfWalker(m) && Math.hypot(state.player.x - m.x, state.player.y - m.y) <= 1.8;
  if (near) {
    faceToward(m, state.player.x, state.player.y);
    p.delivered = true;
    ctx.onProposal?.(p);
    releaseTask(state, m);
    m.task = { kind: 'idle', label: 'Waiting for your answer', until: state.minute + 4 };
    return;
  }
  const tile = nearestFreeNeighbour(ctx.grids(state.player.floor), state.player.x, state.player.y, m.x, m.y);
  if (tile && walkTo(state, ctx.grids, m, state.player.floor, tile) && floorOfWalker(m) === state.player.floor) m.path = m.path.slice(0, 4);
}

/** Snoozed proposals come back; undelivered ones are re-offered in person now and then. */
function reviveProposals(state: GameState): void {
  for (const p of state.proposals) {
    // Suggestions go stale after two days (stock and prices move on).
    if ((p.status === 'pending' || p.status === 'snoozed') && state.minute - p.createdMinute > 2 * 1440) p.status = 'declined';
    if (p.status === 'snoozed' && state.minute >= (p.snoozeUntil ?? 0)) {
      p.status = 'pending';
      p.delivered = false;
    }
  }
}

// ---------------------------------------------------------------------------
// Main update

function idleWander(state: GameState, ctx: StaffContext, m: StaffEntity): void {
  const grid = ctx.grids(floorOfWalker(m));
  for (let i = 0; i < 6; i++) {
    const x = Math.round(m.x + ctx.rng.int(-4, 4));
    const y = Math.round(m.y + ctx.rng.int(-3, 3));
    if (grid[y]?.[x] && walkTo(state, ctx.grids, m, floorOfWalker(m), { x, y })) break;
  }
  m.task = { kind: 'idle', label: 'Tidying up', until: state.minute + ctx.rng.range(6, 14) };
}

function chooseTask(state: GameState, ctx: StaffContext, m: StaffEntity): void {
  if (openProposals(state).some((p) => p.staffId === m.id && p.status === 'pending' && !p.delivered) && ctx.rng.chance(0.1)) {
    const p = openProposals(state).find((x) => x.staffId === m.id && x.status === 'pending' && !x.delivered)!;
    m.task = { kind: 'propose', proposalId: p.id, label: 'Looking for you with a suggestion', until: state.minute + 30 };
    return;
  }
  switch (m.role) {
    case 'sales':
      if (startTill(state, ctx, m) || startHelping(state, ctx, m)) return;
      break;
    case 'maintenance':
      if (maybePropose(state, ctx, m) || startMaintenance(state, ctx, m)) return;
      break;
    case 'stock':
      if (maybePropose(state, ctx, m) || startMaintenance(state, ctx, m)) return;
      break;
    case 'floater': {
      const waiting = state.customers.filter((c) => helpable(c)).length;
      const queue = queueCustomers(state).length;
      if ((queue >= 2 && startTill(state, ctx, m)) || (waiting && startHelping(state, ctx, m))) return;
      if (maybePropose(state, ctx, m) || startMaintenance(state, ctx, m)) return;
      if (startTill(state, ctx, m)) return;
      break;
    }
  }
  idleWander(state, ctx, m);
}

export function staffSpeed(m: StaffEntity): number {
  return 1.3 * (0.75 + m.skills.speed / 100 * 0.6);
}

export function tickStaff(state: GameState, ctx: StaffContext, dtMin: number): void {
  if (!state.staff.length) return;
  reviveProposals(state);
  const onDuty = isOnDuty(state.minute);
  for (const m of state.staff) {
    if (m.dialogue && state.minute > m.dialogueUntil) m.dialogue = null;
    if (!onDuty) {
      if (m.task?.kind !== 'break') {
        releaseTask(state, m);
        walkTo(state, ctx.grids, m, GROUND.id, GROUND.door ?? GROUND.playerStart);
        m.task = { kind: 'break', label: 'Off duty' };
      }
      if (stepPath(m, staffSpeed(m) * dtMin, dtMin)) continue;
      if (m.pending) hopStairs(state, ctx.grids, m);
      continue;
    }
    if (m.task?.kind === 'break') {
      m.task = null;
      m.floor = GROUND.id;
      const door = GROUND.door ?? GROUND.playerStart;
      m.x = door.x;
      m.y = door.y - 1;
      say(state, m, line(ctx.rng, m, 'hello'), 10);
    }
    if (stepPath(m, staffSpeed(m) * dtMin, dtMin)) continue;
    if (m.pending) {
      hopStairs(state, ctx.grids, m);
      continue;
    }
    if (!m.task) {
      chooseTask(state, ctx, m);
      continue;
    }
    const t = m.task;
    switch (t.kind) {
      case 'maintain': {
        if (t.until === undefined) {
          m.facing = 'up';
          t.until = state.minute + JOB_MINUTES[t.fix as FixId] * jobTimeFactor(m);
        } else if (state.minute >= t.until) {
          finishMaintenance(state, ctx, m);
          releaseTask(state, m);
        }
        break;
      }
      case 'serve':
        workTill(state, ctx, m);
        break;
      case 'advise':
        workAdvice(state, ctx, m);
        break;
      case 'propose':
        workProposal(state, ctx, m);
        break;
      default:
        if (state.minute >= (t.until ?? 0)) releaseTask(state, m);
    }
  }
}

/** Where each staff member is and what they are doing (for the PC). */
export function staffStatus(state: GameState, m: StaffEntity): string {
  if (!isOnDuty(state.minute)) return 'Off duty';
  const floor = floorOfWalker(m);
  return `${m.task?.label ?? 'Looking for work'}${floor !== state.player.floor ? ` (${floor === 'ground' ? 'ground floor' : floor})` : ''}`;
}

/** Tank the staff member is working on, if any (used to avoid double-booking). */
export function staffTank(m: StaffEntity): string | null {
  return m.task?.tankId ?? null;
}

export { floorOfTank };
