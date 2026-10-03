/**
 * Idle Mode: an observation state. The persistent simulation (clock, water,
 * hunger, growth, breeding, customers, wages, deliveries) does not advance,
 * and anything that changes the business is refused, while the renderer
 * keeps animating fish, plants and water. The flag lives on GameState at
 * runtime only and is stripped when saving: loading always resumes normal
 * play (see DECISIONS.md).
 */
import type { GameState } from './types';

/** Kinds of player action Idle Mode blocks, for clear messages. */
export type LockKind = 'buy' | 'sell' | 'order' | 'price' | 'staff' | 'expand' | 'maintenance' | 'aquascape' | 'livestock' | 'serve' | 'time' | 'approve';

const VERB: Record<LockKind, string> = {
  buy: 'buy things',
  sell: 'sell things',
  order: 'order stock',
  price: 'change prices',
  staff: 'hire or manage staff',
  expand: 'build expansions',
  maintenance: 'feed or maintain tanks',
  aquascape: 'change the aquascape',
  livestock: 'move or sell fish',
  serve: 'serve customers',
  time: 'move time forward',
  approve: 'approve staff suggestions',
};

export function isIdle(state: GameState): boolean {
  return !!state.idle;
}

/** Null when allowed; otherwise the message to show. */
export function idleLockReason(state: GameState, kind: LockKind): string | null {
  return state.idle ? `Unavailable in Idle Mode. Choose Resume Business to ${VERB[kind]}.` : null;
}

export const IDLE_MESSAGE = 'Unavailable in Idle Mode.';

/** Refusal used by every sim action that changes the business (defence in depth behind the UI locks). */
export function idleRefusal(): { ok: false; message: string; minutes: 0 } {
  return { ok: false, message: IDLE_MESSAGE, minutes: 0 };
}
