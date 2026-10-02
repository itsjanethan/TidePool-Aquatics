/**
 * Simulation: top-level orchestrator. Owns no rendering. Advances game time,
 * ticks tanks in fixed steps, customers continuously, and handles day
 * boundaries. Everything mutates the plain GameState.
 */
import { Emitter } from '../core/events';
import { Rng } from '../core/rng';
import { buildCustomerGrid, buildWalkGrid, FLOOR1, type FloorLayout } from '../data/shopLayout';
import { getSpecies } from '../data/species';
import { updateCustomers, type CustomerContext, type CustomerEvent } from './customers';
import { dailyRunningCosts, emptyLedger, spend } from './economy';
import { displayName } from './fish';
import { checkObjectives, type ObjectiveDef } from './progression';
import { dailyReputationUpdate } from './reputation';
import { maybeRefreshSuppliers, processDeliveries } from './supplier';
import { tickTank } from './tank';
import { ambientTemperature, CLOSE_HOUR, dayOf, hourOf, MINUTES_PER_DAY, OPEN_HOUR } from './time';
import type { GameState, LedgerDay, LogEntry, RepDimension } from './types';

export const TANK_STEP_MINUTES = 5;

export interface DayReport {
  ledger: LedgerDay;
  rent: number;
  electricity: number;
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
}

export class Simulation {
  readonly events = new Emitter<SimEvents>();
  readonly rng: Rng;
  readonly layout: FloorLayout = FLOOR1;
  readonly grid: boolean[][];
  readonly customerCtx: CustomerContext;
  private tankAccumulator = 0;
  private pendingReport: DayReport | null = null;

  constructor(public state: GameState) {
    this.rng = new Rng(state.rngState || state.seed || 1);
    this.grid = buildWalkGrid(this.layout);
    this.customerCtx = {
      layout: this.layout,
      grid: buildCustomerGrid(this.layout),
      rng: this.rng,
      onEvent: (e) => this.events.emit('customer', e),
    };
  }

  log(text: string, kind: LogEntry['kind'] = 'info'): void {
    const e: LogEntry = { minute: this.state.minute, text, kind };
    this.state.log.push(e);
    if (this.state.log.length > 80) this.state.log.shift();
    this.events.emit('log', e);
  }

  /** Advances the simulation by `minutes` of game time. */
  advance(minutes: number): void {
    if (minutes <= 0) return;
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
      });
    }
  }

  private endOfDay(): void {
    const s = this.state;
    const costs = dailyRunningCosts(s);
    spend(s, costs.rent, 'Rent', true);
    spend(s, costs.electricity, 'Electricity', true);
    const repDeltas = dailyReputationUpdate(s);
    const finished = s.today;
    s.ledger.push(finished);
    if (s.ledger.length > 60) s.ledger.shift();
    s.today = emptyLedger(dayOf(s.minute));
    this.pendingReport = { ledger: finished, rent: costs.rent, electricity: costs.electricity, repDeltas, deliveries: [] };
    if (s.money < 0) this.log('You are overdrawn! Sell stock and cut costs.', 'warn');
  }

  private openShop(): void {
    const s = this.state;
    const day = dayOf(s.minute);
    maybeRefreshSuppliers(s, this.rng, day);
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
