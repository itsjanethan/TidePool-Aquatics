/** "Copy Playtest Report": builds the text locally and copies it. Nothing is transmitted. */
import type { GameController } from '../../game/GameController';
import { playtestReport } from '../../sim/playtest';
import { APP_VERSION } from '../../version';
import { h } from '../dom';

export async function copyPlaytestReport(c: GameController): Promise<void> {
  // Blank or cancelled both mean "no description".
  const desc = (await c.ui.prompt('Playtest report', 'Optional: what happened? (leave blank to skip)', '', 200)) ?? '';
  const text = playtestReport(c.state, {
    appVersion: APP_VERSION,
    userAgent: navigator.userAgent,
    screen: `${window.innerWidth}x${window.innerHeight} @${window.devicePixelRatio}x`,
    url: location.origin + location.pathname,
    idle: c.idle,
  }, desc);
  let copied = false;
  try {
    await navigator.clipboard.writeText(text);
    copied = true;
  } catch {
    copied = false;
  }
  // Always show the text too, so it can be copied by hand when the clipboard is blocked.
  const area = h('textarea', { class: 'report-text', readonly: 'true', rows: '10' }) as HTMLTextAreaElement;
  area.value = text;
  const scr = c.ui.menu({
    title: copied ? 'Report copied' : 'Playtest report',
    body: h('div', null, h('div', { class: 'small' }, copied ? 'Copied to your clipboard. Paste it into your bug report or message.' : 'Select the text below and copy it.'), area),
    items: [{ label: 'Done', action: () => c.ui.remove(scr) }],
    className: 'wide',
  });
  requestAnimationFrame(() => area.select());
}
