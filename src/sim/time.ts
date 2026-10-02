/**
 * TimeSystem: calendar helpers. Game time is a single integer-ish count of
 * in-game minutes since Day 1 00:00. 28-day seasons, 4 seasons per year.
 */
export const MINUTES_PER_DAY = 1440;
export const DAYS_PER_SEASON = 28;
export const SEASONS = ['Spring', 'Summer', 'Autumn', 'Winter'] as const;
export type Season = (typeof SEASONS)[number];
export const DAYS_PER_YEAR = DAYS_PER_SEASON * SEASONS.length;
export const OPEN_HOUR = 9;
export const CLOSE_HOUR = 18;
/** Real seconds -> game minutes at 1x speed. */
export const GAME_MINUTES_PER_REAL_SECOND = 2;
export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

export const dayOf = (minute: number): number => Math.floor(minute / MINUTES_PER_DAY) + 1;
export const minuteOfDay = (minute: number): number => ((minute % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
export const hourOf = (minute: number): number => Math.floor(minuteOfDay(minute) / 60);

export function seasonOf(minute: number): Season {
  const d = dayOf(minute) - 1;
  return SEASONS[Math.floor((d % DAYS_PER_YEAR) / DAYS_PER_SEASON)];
}

export const yearOf = (minute: number): number => Math.floor((dayOf(minute) - 1) / DAYS_PER_YEAR) + 1;
export const dayOfSeason = (minute: number): number => ((dayOf(minute) - 1) % DAYS_PER_SEASON) + 1;
export const weekdayOf = (minute: number): string => WEEKDAYS[(dayOf(minute) - 1) % 7];

export function isShopOpen(minute: number): boolean {
  const h = minuteOfDay(minute) / 60;
  return h >= OPEN_HOUR && h < CLOSE_HOUR;
}

export function clockString(minute: number): string {
  const m = minuteOfDay(minute);
  const h = Math.floor(m / 60);
  const mm = Math.floor(m % 60);
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

export function dateString(minute: number): string {
  return `${weekdayOf(minute)} ${dayOfSeason(minute)} ${seasonOf(minute)}, Y${yearOf(minute)}`;
}

/** Ambient shop air temperature by season and hour (unheated tanks drift to it). */
export function ambientTemperature(minute: number): number {
  const base: Record<Season, number> = { Spring: 19.5, Summer: 23, Autumn: 19, Winter: 16.5 };
  const h = minuteOfDay(minute) / 60;
  const daily = Math.sin(((h - 9) / 24) * Math.PI * 2) * 1.2;
  return base[seasonOf(minute)] + daily;
}

/** Minute value of the next opening time strictly after `minute`. */
export function nextOpening(minute: number): number {
  const day = dayOf(minute);
  const todayOpen = (day - 1) * MINUTES_PER_DAY + OPEN_HOUR * 60;
  return minute < todayOpen ? todayOpen : todayOpen + MINUTES_PER_DAY;
}
