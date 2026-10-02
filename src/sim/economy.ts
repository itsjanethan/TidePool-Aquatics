/**
 * ShopEconomy: money in/out, daily running costs, ledger.
 */
import { round } from '../core/math';
import { AIR_PUMP, getFilter, getHeater } from '../data/catalog';
import type { GameState, LedgerDay } from './types';

export const DAILY_RENT = 30;
export const ELECTRICITY_PER_UNIT = 1; // £ per power unit per day
export const TANK_BASE_POWER = 0.35; // light + misc per tank

export function emptyLedger(day: number): LedgerDay {
  return { day, income: 0, expenses: 0, fishSold: 0, customersServed: 0, customersLost: 0, deaths: 0, notes: [] };
}

export function canAfford(state: GameState, amount: number): boolean {
  return state.money >= amount - 1e-9;
}

/** Deducts money. Returns false (and changes nothing) if unaffordable unless `allowDebt`. */
export function spend(state: GameState, amount: number, note: string, allowDebt = false): boolean {
  if (amount <= 0) return true;
  if (!allowDebt && !canAfford(state, amount)) return false;
  state.money = round(state.money - amount, 2);
  state.today.expenses = round(state.today.expenses + amount, 2);
  if (note) state.today.notes.push(`-${amount.toFixed(2)} ${note}`);
  if (state.today.notes.length > 60) state.today.notes.shift();
  return true;
}

export function earn(state: GameState, amount: number, note: string): void {
  if (amount <= 0) return;
  state.money = round(state.money + amount, 2);
  state.today.income = round(state.today.income + amount, 2);
  state.stats.totalSales = round(state.stats.totalSales + amount, 2);
  if (note) state.today.notes.push(`+${amount.toFixed(2)} ${note}`);
  if (state.today.notes.length > 60) state.today.notes.shift();
}

export function dailyRunningCosts(state: GameState): { rent: number; electricity: number; total: number } {
  let power = 0;
  for (const id of state.tankOrder) {
    const t = state.tanks[id];
    power += TANK_BASE_POWER + getFilter(t.filterId).powerPerDay;
    if (t.heaterId) power += getHeater(t.heaterId).powerPerDay;
    if (t.airStone) power += AIR_PUMP.powerPerDay;
  }
  const electricity = round(power * ELECTRICITY_PER_UNIT, 2);
  return { rent: DAILY_RENT, electricity, total: round(DAILY_RENT + electricity, 2) };
}

/** Player-set price for a species, falling back to suggested retail. */
export function priceFor(state: GameState, speciesId: string, suggested: number): number {
  return state.prices[speciesId] ?? round(suggested, 2);
}
