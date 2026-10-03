/**
 * Developer Sandbox entry and tools screen (developer builds only).
 * Floor and tank navigation, presets, time controls, reset, and the
 * Developer Panel for spawning livestock and changing conditions.
 */
import type { GameController } from '../game/GameController';
import { FLOORS, floorOfTank, getFloorLayout, findProp } from '../data/floors';
import { h } from '../ui/dom';
import type { MenuItem } from '../ui/menu';
import { applyPreset, createSandbox, PRESETS, SANDBOX_SEED } from './sandbox';
import { Rng } from '../core/rng';
import { clockString, dateString } from '../sim/time';

export function startSandbox(c: GameController): void {
  c.startGame(createSandbox());
  c.ui.toast('Developer Sandbox: everything unlocked. Press ` for tools.', 'info', 4000);
}

/** Moves the player to a floor (or in front of a tank) and redraws the shop. */
function goTo(c: GameController, floor: string, tankId?: string): void {
  const s = c.state;
  const layout = getFloorLayout(floor);
  const prop = tankId ? findProp(tankId)?.prop : null;
  const spot = prop?.interact?.[0] ?? layout.playerStart;
  s.player.floor = layout.id;
  s.player.x = spot.x;
  s.player.y = spot.y;
  s.player.facing = 'up';
  c.ui.clear();
  if (c.game.scene.isActive('Tank')) c.closeTankView();
  c.refreshWorld();
}

export function openSandboxTools(c: GameController): void {
  const s = c.state;
  let presetIdx = 0;
  let tankIdx = Math.max(0, s.tankOrder.indexOf(PRESETS[0].tank));
  const items = (): MenuItem[] => {
    const preset = PRESETS[presetIdx];
    const tankId = s.tankOrder[tankIdx];
    return [
      { label: 'Floors', header: true },
      ...FLOORS.map((f) => ({ label: f.layout.name, right: s.unlocks.floors.includes(f.id) ? '' : 'locked', action: () => goTo(c, f.id) })),
      { label: 'Tanks', header: true },
      {
        label: `Tank: ${s.tanks[tankId].name}`,
        right: `${getFloorLayout(floorOfTank(tankId)).name}`,
        hint: 'Left / Right to choose. Confirm to walk there; R in the shop opens the tank view.',
        onLeft: () => { tankIdx = (tankIdx - 1 + s.tankOrder.length) % s.tankOrder.length; scr.refresh(items()); },
        onRight: () => { tankIdx = (tankIdx + 1) % s.tankOrder.length; scr.refresh(items()); },
        action: () => goTo(c, floorOfTank(tankId), tankId),
      },
      { label: 'Open tank view', action: () => { goTo(c, floorOfTank(tankId), tankId); setTimeout(() => c.openTankView(tankId), 50); } },
      { label: 'Presets', header: true },
      {
        label: `Preset: ${preset.label}`,
        hint: `${preset.blurb} Default tank ${preset.tank}. Left / Right to choose.`,
        onLeft: () => { presetIdx = (presetIdx - 1 + PRESETS.length) % PRESETS.length; scr.refresh(items()); },
        onRight: () => { presetIdx = (presetIdx + 1) % PRESETS.length; scr.refresh(items()); },
      },
      {
        label: `Apply to ${s.tanks[tankId].name}`,
        hint: 'Replaces this tank\'s fish and decor using the real systems. Marine presets need a marine tank.',
        action: () => {
          try {
            applyPreset(s, tankId, preset.id, new Rng(SANDBOX_SEED + tankIdx));
            c.ui.toast(`${preset.label} applied to ${s.tanks[tankId].name}.`, 'good');
          } catch (e) {
            c.ui.toast((e as Error).message, 'warn');
          }
        },
      },
      { label: `Use default tank (${preset.tank})`, action: () => { tankIdx = s.tankOrder.indexOf(preset.tank); scr.refresh(items()); } },
      { label: 'Time', header: true },
      { label: 'Advance 1 hour', action: () => { c.sim!.advance(60); scr.renderBody(); } },
      { label: 'Advance 1 day', action: () => { c.sim!.advance(1440); scr.renderBody(); } },
      { label: 'Skip to next opening', action: () => { c.endDay(); } },
      { label: 'Developer tools', header: true },
      { label: 'Developer Panel (spawn, conditions, customers)', hint: 'Also on the ` key.', action: () => void import('./devPanel').then((m) => m.toggleDevPanel(c)) },
      {
        label: 'Reset sandbox',
        hint: 'Rebuilds the sandbox from its fixed seed. Sandbox saves are kept.',
        action: () => void c.ui.confirm('Reset the Developer Sandbox to its starting state?').then((y) => { if (y) startSandbox(c); }),
      },
      { label: 'Close', action: () => c.ui.remove(scr) },
    ];
  };
  const scr = c.ui.menu({
    title: 'Developer Sandbox',
    body: () => h('div', { class: 'small' }, `${dateString(s.minute)} ${clockString(s.minute)} · £${Math.round(s.money)} · ${s.tankOrder.length} tanks · ${s.staff.length} staff. Saves go to a separate sandbox namespace and never appear under Continue.`),
    items: items(),
    className: 'wide tall',
  });
}
