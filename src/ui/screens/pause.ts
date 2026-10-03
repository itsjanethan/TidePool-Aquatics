/** Pause menu with save/load/export. */
import type { GameController } from '../../game/GameController';
import { AUTOSAVE_TEXT, SPEEDS } from '../../game/GameController';
import { formatMoney } from '../../core/math';
import { SLOTS, slotLabel } from '../../sim/save';
import { clockString, dateString } from '../../sim/time';
import { h } from '../dom';
import type { MenuItem } from '../menu';
import { showHelp } from './help';
import { isMuted, setMuted } from '../../audio/sfx';
import { getQuality, QUALITY_LEVELS, setQuality } from '../../render/quality';
import { openGoals, reputationEl } from './office';

export function openPauseMenu(c: GameController): void {
  const s = c.state;
  const items = (): MenuItem[] => [
      { label: 'Resume', action: () => c.ui.remove(scr) },
      { label: 'Save game', right: 'at office PC', hint: `Walk to the office PC (top right) to save, load, export or import. ${AUTOSAVE_TEXT}`, disabled: true },
      { label: 'Goals', action: () => openGoals(c) },
      ...settingsItems(c, () => scr.refresh(items())),
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

/** Speed and sound rows, shared by the pause menu and the PC settings screen. */
export function settingsItems(c: GameController, refresh: () => void): MenuItem[] {
  const s = c.state;
  const step = (d: number) => {
    s.settings.speed = SPEEDS[Math.max(0, Math.min(SPEEDS.length - 1, SPEEDS.indexOf(s.settings.speed) + d))];
    refresh();
  };
  return [
    { label: 'Game speed', right: `${s.settings.speed}x`, hint: 'Left / Right to change. T also cycles speed in the shop.', onLeft: () => step(-1), onRight: () => step(1), action: () => step(s.settings.speed === SPEEDS[SPEEDS.length - 1] ? -99 : 1) },
    {
      label: 'Visual quality',
      right: getQuality()[0].toUpperCase() + getQuality().slice(1),
      hint: 'Tank view effects (particles, caustics, shadows, plant animation). Fish detail is the same at every setting. Applies next time you open a tank.',
      onLeft: () => { setQuality(QUALITY_LEVELS[Math.max(0, QUALITY_LEVELS.indexOf(getQuality()) - 1)]); refresh(); },
      onRight: () => { setQuality(QUALITY_LEVELS[Math.min(2, QUALITY_LEVELS.indexOf(getQuality()) + 1)]); refresh(); },
      action: () => { setQuality(QUALITY_LEVELS[(QUALITY_LEVELS.indexOf(getQuality()) + 1) % 3]); refresh(); },
    },
    { label: 'Sound', right: isMuted() ? 'Off' : 'On', onLeft: () => { setMuted(!isMuted()); refresh(); }, onRight: () => { setMuted(!isMuted()); refresh(); }, action: () => { setMuted(!isMuted()); refresh(); } },
  ];
}

export function openSettings(c: GameController): void {
  const items = (): MenuItem[] => [...settingsItems(c, () => scr.refresh(items())), { label: 'Back', action: () => c.ui.remove(scr) }];
  const scr = c.ui.menu({ title: 'Settings', body: h('div', { class: 'small' }, AUTOSAVE_TEXT), items: items() });
}

export function openStats(c: GameController): void {
  const s = c.state;
  const st = s.stats;
  const row = (k: string, v: string) => h('div', { class: 'row' }, h('span', null, k), h('b', null, v));
  const strains = Object.values(s.strains ?? {});
  const scr = c.ui.menu({
    title: 'Shop Statistics',
    body: h(
      'div',
      null,
      row('Days trading', String(Math.floor(s.minute / 1440) + 1)),
      row('Total sales', formatMoney(st.totalSales)),
      row('Customers served', String(st.customersServed)),
      row('Fish sold', String(st.totalFishSold)),
      row('Plants sold', String(st.plantsSold ?? 0)),
      row('Fish bred', String(st.fishBred)),
      row('Fry lost to adults', String(st.fryEaten ?? 0)),
      row('Fish lost', String(st.fishDied)),
      row('Advice given (good)', `${st.adviceGiven} (${st.goodAdvice})`),
      row('Named strains', strains.length ? strains.map((x) => x.name).join(', ') : 'none yet'),
    ),
    items: [{ label: 'Back', action: () => c.ui.remove(scr) }],
    className: 'wide',
  });
}

/** Load from a slot, warning first when a game is running. */
export async function openLoad(c: GameController): Promise<void> {
  if (c.inGame && !(await c.ui.confirm(`Load a different save? ${c.lastSaveText()} Unsaved progress will be lost.`))) return;
  await openSaveSlots(c, 'load');
}

/** Import from a file or pasted text, warning first when a game is running. */
export async function openImport(c: GameController): Promise<void> {
  if (c.inGame && !(await c.ui.confirm(`Import a save and replace the current game? ${c.lastSaveText()} Unsaved progress will be lost.`))) return;
  if (DOWNLOADS_BLOCKED) importSaveText(c);
  else importSave(c);
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
              if (ok) {
                c.hud.flashSaved(`Saved ${clockString(c.state.minute)}`);
                await c.ui.say(null, `Game saved. ${slotLabel(sl)}, ${dateString(c.state.minute)} ${clockString(c.state.minute)}.`);
              }
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
