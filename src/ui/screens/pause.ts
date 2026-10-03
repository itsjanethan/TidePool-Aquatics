/** Pause menu with save/load/export. */
import type { GameController } from '../../game/GameController';
import { SPEEDS } from '../../game/GameController';
import { formatMoney } from '../../core/math';
import { SLOTS, slotLabel } from '../../sim/save';
import { clockString, dateString } from '../../sim/time';
import { h } from '../dom';
import type { MenuItem } from '../menu';
import { showHelp } from './help';
import { isMuted, setMuted } from '../../audio/sfx';
import { openGoals, reputationEl } from './office';

export function openPauseMenu(c: GameController): void {
  const s = c.state;
  const items = (): MenuItem[] => [
      { label: 'Resume', action: () => c.ui.remove(scr) },
      { label: 'Save game', right: 'at office PC', hint: 'Walk to the office PC (top right) to save. The game also autosaves every morning at 09:00.', disabled: true },
      { label: 'Load game', action: () => openSaveSlots(c, 'load') },
      { label: 'Goals', action: () => openGoals(c) },
      { label: 'Game speed', right: `${s.settings.speed}x`, onLeft: () => { s.settings.speed = SPEEDS[Math.max(0, SPEEDS.indexOf(s.settings.speed) - 1)]; scr.refresh(items()); }, onRight: () => { s.settings.speed = SPEEDS[Math.min(SPEEDS.length - 1, SPEEDS.indexOf(s.settings.speed) + 1)]; scr.refresh(items()); } },
      { label: 'Sound', right: isMuted() ? 'off' : 'on', action: () => { setMuted(!isMuted()); scr.refresh(items()); } },
      { label: 'Export save file', hint: 'Download a backup you can import on any device.', action: () => exportSave(c) },
      { label: 'How to play', action: () => showHelp(c) },
      { label: 'Quit to title', action: () => void c.ui.confirm(`Quit to the title screen? ${c.lastSaveText()} Anything since then will be lost.`).then((y) => y && c.toTitle()) },
  ];
  const scr = c.ui.menu({
    title: 'Paused',
    body: () => h('div', null, h('div', { class: 'row' }, h('span', null, s.shopName), h('b', null, formatMoney(s.money))), h('div', { class: 'small save-status' }, c.lastSaveText()), reputationEl(c)),
    items: items(),
    className: 'wide',
  });
}

export async function openSaveSlots(c: GameController, mode: 'save' | 'load', fromTitle = false, onDone?: () => void): Promise<void> {
  const sums = await c.saves.list();
  const slots = mode === 'save' ? SLOTS.filter((sl) => sl !== 'auto') : SLOTS;
  const scr = c.ui.menu({
    title: mode === 'save' ? 'Save Game' : 'Load Game',
    body: h('div', { class: 'small' }, `${fromTitle ? '' : `${c.lastSaveText()} `}Saves are stored in this browser. Use Export for a backup copy.`),
    items: [
      ...slots.map((sl) => {
        const sum = sums.find((x) => x.slot === sl);
        const label = sl === 'auto' ? 'Autosave' : `Slot ${sl.slice(-1)}`;
        return {
          label: sum ? `${label}: ${sum.shopName}` : `${label}: empty`,
          right: sum ? sum.dateLabel : '',
          hint: sum ? `${formatMoney(sum.money)} · saved ${new Date(sum.savedAt).toLocaleString()}` : undefined,
          disabled: mode === 'load' && !sum,
          action: async () => {
            if (mode === 'save') {
              if (sum && !(await c.ui.confirm('Overwrite this save?'))) return;
              const ok = await c.save(sl);
              c.ui.remove(scr);
              if (ok) await c.ui.say(null, `Game saved to ${slotLabel(sl)} (${dateString(c.state.minute)}, ${clockString(c.state.minute)}).`);
              onDone?.();
            } else {
              c.ui.remove(scr);
              await c.load(sl);
            }
          },
        };
      }),
      { label: 'Back', action: () => c.ui.remove(scr) },
    ],
  });
  void fromTitle;
}

/** Hosts that block downloads (single-file builds) get a copyable text box instead. */
export const DOWNLOADS_BLOCKED = import.meta.env.MODE === 'single';

function showSaveText(c: GameController, data: string): void {
  const ta = h('textarea', { class: 'save-text', readonly: true, id: 'save-export-text' }, data) as HTMLTextAreaElement;
  const scr = c.ui.menu({
    title: 'Export Save',
    body: h('div', null, h('div', { class: 'small' }, 'Copy this text and keep it somewhere safe. Use Import on the title screen to restore it.'), ta),
    items: [
      {
        label: 'Copy to clipboard',
        action: () => {
          const fallback = () => {
            ta.focus();
            ta.select();
            c.ui.toast('Text selected. Press Ctrl+C (or Cmd+C) to copy.', 'info');
          };
          try {
            navigator.clipboard.writeText(data).then(() => c.ui.toast('Save copied to clipboard.', 'good'), fallback);
          } catch {
            fallback();
          }
        },
      },
      { label: 'Done', action: () => c.ui.remove(scr) },
    ],
    className: 'wide',
  });
}

export function exportSave(c: GameController): void {
  const data = c.saves.exportString(c.state);
  if (DOWNLOADS_BLOCKED) {
    showSaveText(c, data);
    return;
  }
  const blob = new Blob([data], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `tidepool-${c.state.shopName.replace(/\W+/g, '_')}-day${Math.floor(c.state.minute / 1440) + 1}.json`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 1000);
  c.ui.toast('Save file downloaded.', 'good');
}

export function importSaveText(c: GameController): void {
  const ta = h('textarea', { class: 'save-text', id: 'save-import-text', placeholder: 'Paste your save text here' }) as HTMLTextAreaElement;
  const scr = c.ui.menu({
    title: 'Import Save Text',
    body: h('div', null, ta),
    items: [
      {
        label: 'Load this save',
        action: () => {
          try {
            const st = c.saves.importString(ta.value.trim());
            c.ui.remove(scr);
            c.startGame(st);
            c.ui.toast('Save imported', 'good');
          } catch (e) {
            c.ui.toast(`Import failed: ${(e as Error).message}`, 'bad');
          }
        },
      },
      { label: 'Cancel', action: () => c.ui.remove(scr) },
    ],
    className: 'wide',
  });
  setTimeout(() => ta.focus(), 50);
}

export function importSave(c: GameController): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      const st = c.saves.importString(await file.text());
      c.startGame(st);
      c.ui.toast('Save imported', 'good');
    } catch (e) {
      c.ui.toast(`Import failed: ${(e as Error).message}`, 'bad');
    }
  };
  input.click();
}
