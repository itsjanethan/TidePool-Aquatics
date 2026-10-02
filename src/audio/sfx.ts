/**
 * Tiny synthesized sound effects (WebAudio, no assets). Lazily created on the
 * first user gesture to satisfy autoplay rules. Mute is a per-browser setting.
 */
type Sfx = 'move' | 'confirm' | 'back' | 'cash' | 'feed' | 'warn' | 'door' | 'splash';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = readMuted();

function readMuted(): boolean {
  try {
    return localStorage.getItem('tidepool:muted') === '1';
  } catch {
    return false;
  }
}

export function isMuted(): boolean {
  return muted;
}

export function setMuted(m: boolean): void {
  muted = m;
  try {
    localStorage.setItem('tidepool:muted', m ? '1' : '0');
  } catch {
    /* storage unavailable */
  }
}

function ensure(): AudioContext | null {
  if (typeof window === 'undefined' || !('AudioContext' in window)) return null;
  if (!ctx) {
    try {
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = 0.18;
      master.connect(ctx.destination);
    } catch {
      return null;
    }
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

if (typeof window !== 'undefined') {
  const unlock = () => ensure();
  window.addEventListener('keydown', unlock, { once: true });
  window.addEventListener('pointerdown', unlock, { once: true });
}

function tone(freq: number, dur: number, type: OscillatorType, when = 0, vol = 1, slideTo?: number): void {
  const c = ctx!;
  const t = c.currentTime + when;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master!);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise(dur: number, when = 0, vol = 0.4, hp = 2000): void {
  const c = ctx!;
  const len = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = 'highpass';
  f.frequency.value = hp;
  const g = c.createGain();
  g.gain.value = vol;
  src.connect(f).connect(g).connect(master!);
  src.start(c.currentTime + when);
}

export function play(s: Sfx): void {
  if (muted || !ensure() || !master) return;
  switch (s) {
    case 'move': tone(880, 0.04, 'square', 0, 0.25); break;
    case 'confirm': tone(660, 0.06, 'square', 0, 0.35); tone(990, 0.08, 'square', 0.05, 0.3); break;
    case 'back': tone(440, 0.07, 'square', 0, 0.3, 300); break;
    case 'cash': tone(1318, 0.09, 'triangle', 0, 0.6); tone(1760, 0.18, 'triangle', 0.08, 0.6); noise(0.08, 0, 0.15, 5000); break;
    case 'feed': noise(0.25, 0, 0.25, 3000); break;
    case 'warn': tone(220, 0.15, 'sawtooth', 0, 0.3); break;
    case 'door': tone(1046, 0.25, 'sine', 0, 0.35); tone(784, 0.35, 'sine', 0.15, 0.3); break;
    case 'splash': noise(0.35, 0, 0.3, 800); tone(300, 0.2, 'sine', 0, 0.2, 120); break;
  }
}
