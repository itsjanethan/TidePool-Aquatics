/**
 * Staff data: personalities (each a trade-off), roles, names and lines.
 */
import type { Personality, StaffRole, StaffSkills } from '../sim/types';

export interface PersonalityDef {
  id: Personality;
  label: string;
  blurb: string;
  strengths: string[];
  weaknesses: string[];
  /** Added to rolled skills (can be negative). */
  bias: Partial<StaffSkills>;
  /** Experience multiplier (how fast skills grow). */
  learn: number;
  /** Multiplier on task durations (lower = faster). */
  taskTime: number;
  /** How completely cleaning jobs get done (1 = perfect for their skill). */
  thoroughness: number;
  /** Chance per customer chat of chatting too long (slower, but customers like it). */
  chatty: number;
  /** Wage multiplier. */
  wageMul: number;
  /** Personal dialogue pools (fall back to STAFF_LINES). */
  lines?: Partial<Record<keyof typeof STAFF_LINES, string[]>>;
}

export const PERSONALITIES: PersonalityDef[] = [
  {
    id: 'meticulous', label: 'Meticulous', blurb: 'Does every job properly, never quickly.',
    strengths: ['Spotless cleaning', 'Careful with fish'], weaknesses: ['Slow', 'Can keep customers waiting'],
    bias: { cleaning: 18, speed: -15 }, learn: 1, taskTime: 1.25, thoroughness: 1.1, chatty: 0.05, wageMul: 1.05, lines: { hello: ['Morning. I have a list.'], onIt: ['I will do it properly.'], done: ['Spotless. As it should be.'], proposal: ['A small observation, if I may.'] },
  },
  {
    id: 'chatty', label: 'Chatty', blurb: 'Customers love them. Jobs take a while between conversations.',
    strengths: ['Great with customers', 'Builds loyalty'], weaknesses: ['Easily distracted', 'Talks instead of cleaning'],
    bias: { service: 20, cleaning: -8 }, learn: 1, taskTime: 1.1, thoroughness: 0.95, chatty: 0.35, wageMul: 1, lines: { hello: ['Hiya! Did you see the match?'], customer: ['Hello! Love your jacket. Fish?', 'Hi! Ask me anything!'], done: ['Done! Oh, and guess what...'], proposal: ['Ooh, I had an idea!'] },
  },
  {
    id: 'speedy', label: 'Speedy', blurb: 'Gets through a list fast. Corners get cut.',
    strengths: ['Fast at every task', 'Covers lots of tanks'], weaknesses: ['Leaves a little dirt behind', 'Rushes advice'],
    bias: { speed: 22, cleaning: -6, knowledge: -6 }, learn: 0.9, taskTime: 0.7, thoroughness: 0.85, chatty: 0.05, wageMul: 1, lines: { hello: ['Right, go go go.'], onIt: ['Already on it.'], done: ['Done. Next!'] },
  },
  {
    id: 'scholar', label: 'Fish nerd', blurb: 'Knows every Latin name. Not a natural salesperson.',
    strengths: ['Excellent advice', 'Sensible stock suggestions'], weaknesses: ['Awkward with customers', 'Slow at the till'],
    bias: { knowledge: 24, service: -12 }, learn: 1.1, taskTime: 1, thoroughness: 1, chatty: 0.15, wageMul: 1.1, lines: { hello: ['Did you know medaka went to space?'], customer: ['Erm. Can I help with... fish?'], proposal: ['I ran the numbers.'], done: ['Parameters nominal.'] },
  },
  {
    id: 'steady', label: 'Steady', blurb: 'Reliable all-rounder. Rarely brilliant, rarely bad.',
    strengths: ['Consistent', 'No weak spots'], weaknesses: ['Learns slowly'],
    bias: { cleaning: 4, service: 4, speed: 4, knowledge: 4 }, learn: 0.75, taskTime: 1, thoroughness: 1, chatty: 0.08, wageMul: 1, lines: { hello: ['Morning.'], done: ['Sorted.'] },
  },
  {
    id: 'eager', label: 'Eager', blurb: 'New to fishkeeping and keen to learn. Cheap.',
    strengths: ['Learns quickly', 'Low wage'], weaknesses: ['Low skills to start', 'Makes beginner mistakes'],
    bias: { cleaning: -10, service: -6, knowledge: -14 }, learn: 1.8, taskTime: 1.05, thoroughness: 0.95, chatty: 0.12, wageMul: 0.75, lines: { hello: ['I read a whole forum thread last night!'], onIt: ['Ooh, can I do it?'], done: ['Did I do it right?'], proposal: ['Boss! Boss! An idea!'] },
  },
];

export function getPersonality(id: Personality): PersonalityDef {
  return PERSONALITIES.find((p) => p.id === id) ?? PERSONALITIES[4];
}

export interface RoleDef {
  id: StaffRole;
  label: string;
  blurb: string;
  /** Skills that matter most, for menus. */
  keySkills: Array<keyof StaffSkills>;
}

export const ROLES: RoleDef[] = [
  { id: 'sales', label: 'Sales', blurb: 'Serves at the till when you are not there and helps customers with questions anywhere in the shop.', keySkills: ['service', 'knowledge'] },
  { id: 'maintenance', label: 'Tank Maintenance', blurb: 'Works through tank problems by priority from the diagnostics: dead fish and toxins first, then feeding, then cleaning.', keySkills: ['cleaning', 'speed'] },
  { id: 'stock', label: 'Stock', blurb: 'Watches demand and stock levels and brings you order suggestions to approve. Feeds tanks between jobs.', keySkills: ['knowledge', 'speed'] },
  { id: 'floater', label: 'Floater', blurb: 'Goes wherever needed: customers waiting first, otherwise tank jobs.', keySkills: ['service', 'cleaning'] },
];

export function getRole(id: StaffRole): RoleDef {
  return ROLES.find((r) => r.id === id) ?? ROLES[3];
}

export const SKILL_LABEL: Record<keyof StaffSkills, string> = {
  cleaning: 'Cleaning',
  service: 'Service',
  speed: 'Speed',
  knowledge: 'Knowledge',
};

export const STAFF_FIRST = [
  'Priya', 'Tom', 'Aisha', 'Jordan', 'Mei', 'Callum', 'Fern', 'Dev', 'Rosa', 'Kwame', 'Isla', 'Ollie', 'Sana', 'Rhys', 'Nadia', 'Theo',
  'Bea', 'Marco', 'Ellie', 'Jun', 'Kit', 'Amara', 'Finn', 'Leah',
];

export const STAFF_LINES = {
  hello: ['Morning!', 'Reporting for duty.', 'Ready when you are.'],
  onIt: ['On it.', 'I will sort that.', 'Leave it with me.'],
  customer: ['Can I help?', 'Looking for anything?', 'Hi there!'],
  proposal: ['Got a minute?', 'Quick idea for you.', 'Boss, a suggestion.'],
  done: ['All done.', 'Sorted.', 'That looks better.'],
  noFood: ['We are out of food!'],
};
