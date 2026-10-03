/** Idle Mode locks for menu items: the row stays visible and selectable, says why, and does nothing. */
import type { GameController } from '../../game/GameController';
import type { LockKind } from '../../sim/idle';
import type { MenuItem } from '../menu';

export function locked(c: GameController, kind: LockKind, item: MenuItem): MenuItem {
  const reason = c.lockReason(kind);
  if (!reason) return item;
  return { ...item, right: 'Idle Mode', hint: reason, disabled: true, action: undefined, onLeft: undefined, onRight: undefined, className: `${item.className ?? ''} locked` };
}
