/**
 * Playtest report: a plain-text summary the player can copy and paste into a
 * bug report. Built locally on request; nothing is ever sent anywhere.
 */
import { formatMoney } from '../core/math';
import { SAVE_VERSION } from './newGame';
import { currentObjective } from './progression';
import { overallReputation, repStars } from './reputation';
import { clockString, dateString } from './time';
import type { GameState } from './types';

export interface ReportEnv {
  appVersion: string;
  userAgent?: string;
  screen?: string;
  url?: string;
  /** Idle Mode on (state.idle is stripped from saves, so pass it explicitly too). */
  idle?: boolean;
}

export function playtestReport(state: GameState, env: ReportEnv, description = ''): string {
  const warnings = state.log.filter((l) => l.kind === 'warn' || l.kind === 'bad').slice(-8);
  const obj = currentObjective(state);
  const rep = overallReputation(state);
  const lines = [
    `Tidepool Aquatics playtest report`,
    `Version: ${env.appVersion} (save version ${SAVE_VERSION})`,
    `Day/time: ${dateString(state.minute)} ${clockString(state.minute)}`,
    `Floor: ${state.player.floor}`,
    `Money: ${formatMoney(state.money)}`,
    `Reputation: ${repStars(rep).toFixed(1)} stars (${Math.round(rep)})`,
    `Objective: ${obj ? obj.title : 'all starter goals complete'}`,
    `Idle Mode: ${env.idle ?? !!state.idle ? 'on' : 'off'}`,
    `Tanks: ${state.tankOrder.length}, fish: ${Object.values(state.fish).filter((f) => f.alive).length}, staff: ${state.staff?.length ?? 0}`,
    `Browser: ${env.userAgent ?? 'unknown'}`,
    env.screen ? `Screen: ${env.screen}` : '',
    env.url ? `Page: ${env.url}` : '',
    '',
    'Recent warnings:',
    ...(warnings.length ? warnings.map((w) => `- ${dateString(w.minute)} ${clockString(w.minute)} ${w.text}`) : ['- none']),
    '',
    'What happened:',
    description.trim() || '(not filled in)',
  ];
  return lines.filter((l, i) => l !== '' || lines[i - 1] !== '').join('\n');
}
