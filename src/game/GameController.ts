/**
 * GameController: glue between Phaser scenes, the HTML UI and the pure
 * simulation. Owns the game loop timing, input routing, saving and the
 * high-level flows (menus, serving customers, ending the day).
 */
import Phaser from 'phaser';
import { InputManager, type Action } from '../input/input';
import { Simulation } from '../sim/simulation';
import { newGame } from '../sim/newGame';
import { createStorage, SaveManager, MemoryStorage, slotLabel } from '../sim/save';
import { clockString, dateString, GAME_MINUTES_PER_REAL_SECOND } from '../sim/time';
import type { ActionResult } from '../sim/tank';
import type { GameState } from '../sim/types';
import { UIManager } from '../ui/ui';
import { Hud } from '../ui/hud';
import { markObjective } from '../sim/progression';
import { toggleDevPanel } from '../ui/screens/devPanel';
import { showDayReport } from '../ui/screens/report';
import { showIntro } from '../ui/screens/help';
import { play } from '../audio/sfx';
import { installTouchControls } from '../ui/touch';

export const DEV_ALLOWED: boolean =
  import.meta.env.DEV ||
  (typeof location !== 'undefined' && (new URLSearchParams(location.search).has('dev') || location.hash === '#dev'));

export const SPEEDS = [1, 2, 4];

type WorldInput = (a: Action) => void;

export class GameController {
  game!: Phaser.Game;
  ui!: UIManager;
  input!: InputManager;
  hud!: Hud;
  saves: SaveManager = new SaveManager(new MemoryStorage());
  sim: Simulation | null = null;
  /** Handler for input when no UI screen is open (set by the active scene). */
  worldInput: WorldInput | null = null;
  inGame = false;
  /** Non-blocking overlays (e.g. tank view HUD) can pause time explicitly. */
  extraPause = 0;
  private reportQueue: Array<() => void> = [];

  get state(): GameState {
    if (!this.sim) throw new Error('No game in progress');
    return this.sim.state;
  }

  /** Resolves once save storage is ready. */
  ready: Promise<void> = Promise.resolve();

  setup(game: Phaser.Game, uiRoot: HTMLElement): void {
    this.game = game;
    this.ui = new UIManager(uiRoot);
    this.input = new InputManager(window);
    this.hud = new Hud(this);
    this.input.events.on('press', (a) => this.onPress(a));
    installTouchControls(this.input);
    game.events.on(Phaser.Core.Events.STEP, (_t: number, delta: number) => this.step(delta));
    this.ready = createStorage().then((st) => {
      this.saves = new SaveManager(st);
    });
    if (DEV_ALLOWED) (window as unknown as { __tidepool: GameController }).__tidepool = this;
  }

  get paused(): boolean {
    return !this.inGame || this.ui.isBlocking() || this.extraPause > 0;
  }

  private step(deltaMs: number): void {
    const dt = Math.min(0.1, deltaMs / 1000);
    this.input.poll(performance.now());
    this.ui.update(dt);
    if (this.sim && !this.paused) {
      const minutes = dt * GAME_MINUTES_PER_REAL_SECOND * this.state.settings.speed;
      this.sim.advance(minutes);
    }
    if (this.sim && this.inGame) this.hud.update();
    if (!this.ui.isBlocking() && this.reportQueue.length) this.reportQueue.shift()!();
  }

  private onPress(a: Action): void {
    if (a === 'dev' && DEV_ALLOWED && this.inGame) {
      toggleDevPanel(this);
      return;
    }
    if (this.ui.handle(a)) return;
    if (this.inGame && a === 'speed') {
      this.cycleSpeed();
      return;
    }
    this.worldInput?.(a);
  }

  cycleSpeed(): void {
    const s = this.state.settings;
    s.speed = SPEEDS[(SPEEDS.indexOf(s.speed) + 1) % SPEEDS.length];
    this.ui.toast(`Game speed ${s.speed}x`);
  }

  // -------------------------------------------------------------------------
  // Game lifecycle

  startGame(state: GameState): void {
    this.sim?.events.clear();
    this.sim = new Simulation(state);
    this.inGame = true;
    this.sim.events.on('log', (e) => {
      if (e.kind !== 'info' || e.text.startsWith('Day ')) this.ui.toast(e.text, e.kind);
    });
    this.sim.events.on('dayReport', (r) => {
      this.reportQueue.push(() => showDayReport(this, r));
    });
    this.sim.events.on('customer', (e) => {
      if (e.type === 'arrived' && this.game.scene.isActive('Shop')) play('door');
    });
    this.sim.events.on('shopOpened', () => {
      void this.autosave();
    });
    this.ui.clear();
    this.hud.show(true);
    this.game.scene.stop('Title');
    this.game.scene.stop('Tank');
    this.game.scene.start('Shop');
    if (!state.settings.tutorialSeen) {
      state.settings.tutorialSeen = true;
      showIntro(this);
    }
  }

  newGame(playerName: string, shopName: string): void {
    this.startGame(newGame({ playerName, shopName }));
  }

  toTitle(): void {
    this.inGame = false;
    this.sim?.events.clear();
    this.sim = null;
    this.ui.clear();
    this.hud.show(false);
    this.worldInput = null;
    this.game.scene.stop('Shop');
    this.game.scene.stop('Tank');
    this.game.scene.start('Title');
  }

  async save(slot: string): Promise<boolean> {
    if (!this.sim) return false;
    const prev = this.state.lastSave;
    try {
      this.state.lastSave = { slot, minute: this.state.minute, at: Date.now() };
      await this.saves.save(slot, this.state);
      return true;
    } catch (e) {
      console.error(e);
      this.state.lastSave = prev;
      this.ui.toast('Saving failed. Try exporting your save instead.', 'bad');
      return false;
    }
  }

  async autosave(): Promise<void> {
    if (await this.save('auto')) this.ui.toast(`Game autosaved (${dateString(this.state.minute)}, ${clockString(this.state.minute)})`, 'good', 3500);
  }

  /** Plain-language description of the last save, for menus. */
  lastSaveText(): string {
    const ls = this.sim ? this.state.lastSave : undefined;
    if (!ls) return 'Not saved yet. Save at the office PC. The game also autosaves every morning at 09:00.';
    const mins = Math.round((Date.now() - ls.at) / 60000);
    const ago = mins < 1 ? 'just now' : mins < 60 ? `${mins} min ago` : `${Math.round(mins / 60)} h ago`;
    return `Last saved: ${slotLabel(ls.slot)}, ${dateString(ls.minute)} ${clockString(ls.minute)} (${ago}).`;
  }

  async load(slot: string): Promise<boolean> {
    try {
      const st = await this.saves.load(slot);
      if (!st) {
        this.ui.toast('That save slot is empty.', 'warn');
        return false;
      }
      this.startGame(st);
      this.ui.toast('Game loaded', 'good');
      return true;
    } catch (e) {
      this.ui.toast(`Could not load: ${(e as Error).message}`, 'bad');
      return false;
    }
  }

  // -------------------------------------------------------------------------
  // Actions

  /** Runs a timed player action: advances game time and reports the result. */
  perform(result: ActionResult, quiet = false): ActionResult {
    if (result.ok) {
      play(result.message.toLowerCase().includes('feed') || result.message.toLowerCase().includes('food') ? 'feed' : result.message.toLowerCase().includes('water') ? 'splash' : 'confirm');
      if (result.minutes > 0) this.sim!.advance(result.minutes);
      if (!quiet) this.ui.toast(result.message, 'good', 2400);
    } else {
      play('warn');
      this.ui.toast(result.message, 'warn');
    }
    return result;
  }

  openTankView(tankId: string, mode: 'view' | 'aquascape' = 'view'): void {
    markObjective(this.state, 'view_tank');
    this.ui.clear();
    this.game.scene.sleep('Shop');
    this.game.scene.start('Tank', { tankId, mode });
  }

  closeTankView(): void {
    this.game.scene.stop('Tank');
    this.game.scene.wake('Shop');
  }

  endDay(): void {
    if (!this.sim) return;
    this.ui.clear();
    this.sim.skipToNextMorning();
  }
}

export const controller = new GameController();
