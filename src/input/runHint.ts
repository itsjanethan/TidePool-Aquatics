/**
 * "Hold B to run" hint for the store. Shown in the prompt line when nothing
 * is in front of the player, until they have run once on this device. A
 * per-device convenience: stored in localStorage when available, never in the
 * save file, and safe when storage is blocked.
 */
const KEY = 'tidepool.ranOnce';
let ran: boolean | null = null;

function load(): boolean {
  if (ran === null) {
    try {
      ran = globalThis.localStorage?.getItem(KEY) === '1';
    } catch {
      ran = false;
    }
  }
  return ran;
}

/** Records that the player has run, which retires the hint. */
export function noteRan(): void {
  if (load()) return;
  ran = true;
  try {
    globalThis.localStorage?.setItem(KEY, '1');
  } catch {
    /* storage unavailable: the hint just stops for this session */
  }
}

/** Hint text for the device in use, or null once the player has run. */
export function runHint(device: 'keyboard' | 'gamepad' | 'pointer'): string | null {
  if (load()) return null;
  return device === 'keyboard' ? 'Hold Shift or X to run' : 'Hold B to run';
}

/** Tests only. */
export function resetRunHint(): void {
  ran = null;
}
