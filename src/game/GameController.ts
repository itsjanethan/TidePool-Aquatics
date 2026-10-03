/**
 * GameController: glue between Phaser scenes, the HTML UI and the pure
 * simulation. Owns the game loop timing, input routing, saving and the
 * high-level flows (menus, serving customers, ending the day).
 */
import Phaser from 'phaser';
import { InputManager, type Action } from '../input/input';
import { Simulation } from '../sim/simulation';
import { newGame } from '../sim/newGame';
import { idleLockReason, type LockKind } from '../sim/idle';
import { createStorage, isSandboxState, PrefixedStorage, SANDBOX_PREFIX, SaveManager, MemoryStorage, slotLabel } from '../sim/save';
import { clockString, dateString, GAME_MINUTES_PER_REAL_SECOND } from '../sim/time';
import type { ActionResult } from '../sim/tank';
import type { GameState } from '../sim/types';
import { UIManager } from '../ui/ui';
import { Hud } from '../ui/hud';
import { markObjective } from '../sim/progression';
import { showDayReport } from '../ui/screens/report';
import { showProposalPrompt } from '../ui/screens/staff';
import { openHelp, setHelpController, showIntro } from '../ui/screens/help';
import { play } from '../audio/sfx';
import { installTouchControls, type TouchControls } from '../ui/touch';
import type { LayoutManager } from '../ui/layoutManager';
import type { Layout } from '../ui/viewport';
import { getPrefs, setPrefs } from '../ui/displayPrefs';

/**
 * Developer tools are a build-time switch only: no URL, storage flag or
 * console API can enable them in the public build (see DECISIONS.md).
 */
export const DEV_ALLOWED: boolean = __DEV_TOOLS__;

export const SPEEDS = [1, 2, 4];

type WorldInput = (a: Action) => void;

/** Shared wording so every screen describes autosave the same way. */
export const AUTOSAVE_TEXT = 'Autosave is on: the game saves to the Autosave slot every morning at opening (09:00).';

export class GameController {
  game!: Phaser.Game;
  ui!: UIManager;
  input!: InputManager;
  hud!: Hud;
  /** Normal play saves. */
  saves: SaveManager = new SaveManager(new MemoryStorage());
  /** Developer Sandbox saves: a separate key namespace, never listed by Continue. */
  sandboxSaves: SaveManager = new SaveManager(new MemoryStorage(), true);
  sim: Simulation | null = null;
  /** Handler for input when no UI screen is open (set by the active scene). */
  worldInput: WorldInput | null = null;
  /** On-screen controls (touch devices only). */
  touch: TouchControls | null = null;
  /** Responsive page layout (absent in tests). */
  layout: LayoutManager | null = null;
  /** What A and F mean in the store right now (set each frame by the store scene). */
  worldContext: { a?: string; feed?: boolean } = {};
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

  setup(game: Phaser.Game, uiRoot: HTMLElement, layout?: LayoutManager): void {
    this.game = game;
    this.layout = layout ?? null;
    this.ui = new UIManager(uiRoot);
    this.input = new InputManager(window);
    this.hud = new Hud(this);
    setHelpController(this);
    this.input.events.on('press', (a) => this.onPress(a));
    this.touch = installTouchControls(this.input);
    if (this.layout) {
      const place = (l: Layout) => this.touch?.place(l);
      this.layout.onChange(place);
      if (this.layout.layout) place(this.layout.layout);
    }
    game.events.on(Phaser.Core.Events.STEP, (_t: number, delta: number) => this.step(delta));
    this.ready = createStorage().then((st) => {
      this.saves = new SaveManager(st);
      this.sandboxSaves = new SaveManager(new PrefixedStorage(st, SANDBOX_PREFIX), true);
    });
    if (__DEV_TOOLS__) (window as unknown as { __tidepool: GameController }).__tidepool = this;
  }

  /**
   * True while the player is free to walk the store: no blocking screen and
   * the store overworld has input. B runs here; everywhere else B is Back.
   */
  get walking(): boolean {
    return this.inGame && !!this.worldInput && !this.ui.isBlocking();
  }

  /** Idle Mode: business paused, visuals keep running. */
  get idle(): boolean {
    return !!this.sim?.state.idle;
  }

  enterIdle(): void {
    if (!this.sim) return;
    this.sim.state.idle = true;
    this.hud.update(true);
    this.ui.toast('Idle Mode: business paused. Look around as long as you like.', 'info', 3500);
  }

  exitIdle(): void {
    if (!this.sim) return;
    this.sim.state.idle = false;
    this.hud.update(true);
    this.ui.toast('Business resumed.', 'good', 2200);
  }

  /** Opens Help (H key, gamepad LT / right stick click, HUD ? button). Optional section or entry id. */
  openHelp(topic?: string): void {
    const top = this.ui.top();
    if (!topic && top?.el.classList.contains('help-root')) {
      this.ui.remove(top);
      return;
    }
    openHelp(this, topic);
  }

  /** Asks to leave Idle Mode (HUD badge click). */
  askResume(): void {
    if (!this.idle) return;
    void this.ui.confirm('Resume business? The clock, customers and fish care start again.').then((y) => {
      if (y) this.exitIdle();
    });
  }

  /** Null when an action is allowed; otherwise why not (Idle Mode). */
  lockReason(kind: LockKind): string | null {
    return this.sim ? idleLockReason(this.sim.state, kind) : null;
  }

  get paused(): boolean {
    return !this.inGame || this.ui.isBlocking() || this.extraPause > 0;
  }

  private step(deltaMs: number): void {
    const dt = Math.min(0.1, deltaMs / 1000);
    this.input.poll(performance.now());
    this.ui.update(dt);
    if (this.touch) {
      const top = this.ui.top();
      this.touch.setContext({
        walking: this.walking,
        a: this.worldContext.a,
        feed: this.worldContext.feed,
        menuOpen: !!top && !top.el.classList.contains('tank-view-ui'),
      });
    }
    if (this.sim && !this.paused) {
      const minutes = dt * GAME_MINUTES_PER_REAL_SECOND * this.state.settings.speed;
      this.sim.advance(minutes);
    }
    if (this.sim && this.inGame) this.hud.update();
    if (!this.ui.isBlocking() && this.reportQueue.length) this.reportQueue.shift()!();
  }

  private onPress(a: Action): void {
    if (__DEV_TOOLS__ && a === 'dev' && this.inGame) {
      void import('../dev/devPanel').then((m) => m.toggleDevPanel(this));
      return;
    }
    if (a === 'help') {
      this.openHelp();
      return;
    }
    if (this.ui.handle(a)) return;
    if (this.inGame && a === 'map') {
      this.toggleMap();
      return;
    }
    if (this.inGame && a === 'speed') {
      this.cycleSpeed();
      return;
    }
    this.worldInput?.(a);
  }

  /** Store camera: follow the player up close, or show the whole floor. */
  toggleMap(): void {
    const next = getPrefs().camera === 'near' ? 'overview' : 'near';
    setPrefs({ camera: next });
    this.ui.toast(next === 'overview' ? 'Map view: whole floor' : 'Close view: following you', 'info', 1600);
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
    this.sim.events.on('proposal', (p) => {
      this.reportQueue.push(() => void showProposalPrompt(this, p));
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

  /** The save namespace for the current game (sandbox games never touch normal saves). */
  get activeSaves(): SaveManager {
    return this.sim && isSandboxState(this.sim.state) ? this.sandboxSaves : this.saves;
  }

  async save(slot: string): Promise<boolean> {
    if (!this.sim) return false;
    const prev = this.state.lastSave;
    try {
      this.state.lastSave = { slot, minute: this.state.minute, at: Date.now() };
      await this.activeSaves.save(slot, this.state);
      return true;
    } catch (e) {
      console.error(e);
      this.state.lastSave = prev;
      this.ui.toast('Saving failed. Try exporting your save instead.', 'bad');
      return false;
    }
  }

  async autosave(): Promise<void> {
    this.hud.flashSaved('Autosaving...');
    if (await this.save('auto')) this.hud.flashSaved(`Autosaved ${clockString(this.state.minute)}`);
  }

  /** Plain-language description of the last save, for menus. */
  lastSaveText(): string {
    const ls = this.sim ? this.state.lastSave : undefined;
    if (!ls) return `Not saved yet. Save at the office PC. ${AUTOSAVE_TEXT}`;
    const mins = Math.round((Date.now() - ls.at) / 60000);
    const ago = mins < 1 ? 'just now' : mins < 60 ? `${mins} min ago` : `${Math.round(mins / 60)} h ago`;
    return `Last saved: ${slotLabel(ls.slot)}, ${dateString(ls.minute)} ${clockString(ls.minute)} (${ago}).`;
  }

  async load(slot: string): Promise<boolean> {
    try {
      const st = await this.activeSaves.load(slot);
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

  /** Rebuilds the shop scene (after an expansion adds tanks or stairs open). */
  refreshWorld(): void {
    if (this.game.scene.isActive('Shop')) this.game.scene.getScene('Shop').scene.restart();
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
