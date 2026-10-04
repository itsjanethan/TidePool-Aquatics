/**
 * Simulation: top-level orchestrator. Owns no rendering. Advances game time,
 * ticks tanks in fixed steps, customers continuously, and handles day
 * boundaries. Everything mutates the plain GameState.
 */
import { Emitter } from '../core/events';
import { Rng } from '../core/rng';
import { buildCustomerGrid, buildWalkGrid, type FloorLayout } from '../data/shopLayout';
import { FLOORS, GROUND, getFloor } from '../data/floors';
import { getSpecies } from '../data/species';
import { updateCustomers, type CustomerContext, type CustomerEvent } from './customers';
import { dailyRunningCosts, emptyLedger, spend } from './economy';
import { displayName } from './fish';
import { checkObjectives, type ObjectiveDef } from './progression';
import { dailyReputationUpdate } from './reputation';
import { maybeRefreshSuppliers, processDeliveries } from './supplier';
import { tickTank } from './tank';
import { tickBreeding } from './breeding';
import { tickPredation } from './inverts';
import { recoverDemand } from './economy';
import { ambientTemperature, CLOSE_HOUR, dayOf, hourOf, MINUTES_PER_DAY, OPEN_HOUR } from './time';
import type { GameState, LedgerDay, LogEntry, RepDimension, StaffProposal } from './types';
import { refreshApplicants, tickStaff, type StaffContext } from './staff';

export const TANK_STEP_MINUTES = 5;

export interface DayReport {
  ledger: LedgerDay;
  rent: number;
  electricity: number;
  wages: number;
  repDeltas: Partial<Record<RepDimension, number>>;
  deliveries: string[];
}

export interface SimEvents {
  log: LogEntry;
  dayReport: DayReport;
  shopOpened: { day: number };
  shopClosed: { day: number };
  objective: ObjectiveDef;
  customer: CustomerEvent;
  proposal: StaffProposal;
}

export class Simulation {
  readonly events = new Emitter<SimEvents>();
  readonly rng: Rng;
  /** Ground floor (door, till, queue). */
  readonly layout: FloorLayout = GROUND;
  /** Player/staff walk grids per floor. */
  readonly grids: Record<string, boolean[][]> = {};
  readonly customerCtx: CustomerContext;
  readonly staffCtx: StaffContext;
  private tankAccumulator = 0;
  private pendingReport: DayReport | null = null;

  constructor(public state: GameState) {
    this.rng = new Rng(state.rngState || state.seed || 1);
    const customerGrids: Record<string, boolean[][]> = {};
    for (const f of FLOORS) {
      this.grids[f.id] = buildWalkGrid(f.layout);
      customerGrids[f.id] = buildCustomerGrid(f.layout);
    }
    this.customerCtx = {
      layout: this.layout,
      grid: customerGrids[this.layout.id],
      grids: customerGrids,
      rng: this.rng,
      onEvent: (e) => this.events.emit('customer', e),
    };
    this.staffCtx = {
      grids: (f) => this.grids[f] ?? this.grids.ground,
      customers: this.customerCtx,
      rng: this.rng,
      log: (text, kind) => this.log(text, kind),
      onProposal: (p) => this.events.emit('proposal', p),
    };
  }

  /** Walk grid of the player's current floor. */
  get grid(): boolean[][] {
    return this.grids[getFloor(this.state.player.floor).id];
  }

  log(text: string, kind: LogEntry['kind'] = 'info'): void {
    const e: LogEntry = { minute: this.state.minute, text, kind };
    this.state.log.push(e);
    if (this.state.log.length > 80) this.state.log.shift();
    this.events.emit('log', e);
  }

  /** Advances the simulation by `minutes` of game time. */
  advance(minutes: number): void {
    // Idle Mode: the persistent world does not move on.
    if (minutes <= 0 || this.state.idle) return;
    let remaining = minutes;
    while (remaining > 1e-9) {
      // Never step across an hour boundary so open/close/day events are exact.
      const m = this.state.minute;
      const toNextHour = 60 - (m % 60);
      const step = Math.min(remaining, 1, toNextHour);
      this.stepOnce(step);
      remaining -= step;
    }
    this.state.rngState = this.rng.state;
  }

  private stepOnce(dt: number): void {
    const s = this.state;
    const before = s.minute;
    s.minute = before + dt;
    updateCustomers(s, this.customerCtx, dt);
    tickStaff(s, this.staffCtx, dt);

    this.tankAccumulator += dt;
    while (this.tankAccumulator >= TANK_STEP_MINUTES) {
      this.tankAccumulator -= TANK_STEP_MINUTES;
      this.tickTanks(TANK_STEP_MINUTES / 60);
    }

    // Hour boundary events.
    const prevHour = Math.floor(before / 60);
    const newHour = Math.floor(s.minute / 60 + 1e-9);
    if (newHour !== prevHour) {
      const h = hourOf(Math.round(s.minute));
      if (Math.abs(s.minute - Math.round(s.minute)) < 1e-6) s.minute = Math.round(s.minute);
      if (h === 0) this.endOfDay();
      if (h === OPEN_HOUR) this.openShop();
      if (h === CLOSE_HOUR) {
        this.log('The shop is now closed. Finish up and end the day at the door or office PC.', 'info');
        this.events.emit('shopClosed', { day: dayOf(s.minute) });
      }
      for (const o of checkObjectives(s)) {
        this.log(`Goal complete: ${o.title}${o.reward ? ` (+£${o.reward})` : ''}`, 'good');
        this.events.emit('objective', o);
      }
    }
  }

  tickTanks(dtHours: number): void {
    const s = this.state;
    const ambient = ambientTemperature(s.minute);
    const h = (s.minute % MINUTES_PER_DAY) / 60;
    const daylight = h >= 8 && h < 20;
    for (const id of s.tankOrder) {
      const t = s.tanks[id];
      t.lightOn = daylight;
      tickTank(s, t, dtHours, {
        ambient,
        daylight,
        onDeath: (f, tank, cause) => {
          this.log(`A ${displayName(f)} died in ${tank.name} (${cause}).`, 'bad');
        },
        onCoralDeath: (name, tank, cause) => {
          this.log(`A ${name} died in ${tank.name} (${cause}).`, 'bad');
        },
      });
      tickBreeding(s, t, dtHours, this.rng, { log: (text, kind) => this.log(text, kind) });
      tickPredation(s, t, dtHours, this.rng, (text) => this.log(text, 'bad'));
    }
  }

  private endOfDay(): void {
    const s = this.state;
    const costs = dailyRunningCosts(s);
    spend(s, costs.rent, 'Rent', true);
    spend(s, costs.electricity, 'Electricity', true);
    if (costs.wages > 0) spend(s, costs.wages, 'Wages', true);
    const repDeltas = dailyReputationUpdate(s);
    recoverDemand(s);
    const finished = s.today;
    s.ledger.push({ ...finished, notes: finished.notes.slice(-12) });
    if (s.ledger.length > 60) s.ledger.shift();
    s.today = emptyLedger(dayOf(s.minute));
    this.pendingReport = { ledger: finished, rent: costs.rent, electricity: costs.electricity, wages: costs.wages, repDeltas, deliveries: [] };
    if (s.money < 0) this.log('You are overdrawn! Sell stock and cut costs.', 'warn');
  }

  private openShop(): void {
    const s = this.state;
    const day = dayOf(s.minute);
    maybeRefreshSuppliers(s, this.rng, day);
    refreshApplicants(s, this.rng);
    const deliveries = processDeliveries(s, this.rng, day);
    for (const d of deliveries) this.log(d, 'good');
    this.log(`Day ${day}: the shop is open!`, 'info');
    if (this.pendingReport) {
      this.pendingReport.deliveries = deliveries;
      this.events.emit('dayReport', this.pendingReport);
      this.pendingReport = null;
    }
    this.events.emit('shopOpened', { day });
  }

  /** Skips forward to the next opening time (end of day / sleep). */
  skipToNextMorning(): void {
    const s = this.state;
    if (s.idle) return;
    const day = dayOf(s.minute);
    const nextOpen = (s.minute % MINUTES_PER_DAY) / 60 < OPEN_HOUR
      ? (day - 1) * MINUTES_PER_DAY + OPEN_HOUR * 60
      : day * MINUTES_PER_DAY + OPEN_HOUR * 60;
    // Customers still inside leave when the doors close.
    s.customers = [];
    for (const f of Object.values(s.fish)) f.reservedBy = null;
    this.advance(nextOpen - s.minute);
  }

  speciesName(id: string): string {
    return getSpecies(id).commonName;
  }
}
