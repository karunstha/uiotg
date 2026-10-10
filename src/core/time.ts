import { z } from 'zod';

/** IANA time zone validated against the runtime's tz database. */
export const timeZoneSchema = z
  .string()
  .min(1)
  .max(64)
  .refine(isValidTimeZone, { message: 'Unknown IANA time zone, e.g. "Europe/London" or "America/New_York"' })
  .describe('IANA time zone, e.g. "Asia/Tokyo"');

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: string;
}

/** Wall-clock parts of `date` in `timeZone`. */
export function zoned(date: Date, timeZone: string): ZonedParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    weekday: 'long',
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '0';
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    hour: Number(get('hour')) % 24,
    minute: Number(get('minute')),
    second: Number(get('second')),
    weekday: get('weekday'),
  };
}

/** Offset of `timeZone` from UTC at `date`, in minutes. */
export function offsetMinutes(date: Date, timeZone: string): number {
  const p = zoned(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60_000);
}

/** "GMT+9" / "PDT"-style short zone name. */
export function zoneAbbreviation(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'short' }).formatToParts(date).find((p) => p.type === 'timeZoneName')?.value ?? timeZone;
}

export function formatClock(hour: number, minute: number, opts: { hour12?: boolean; second?: number } = {}): { time: string; suffix: string } {
  const pad = (n: number) => String(n).padStart(2, '0');
  const sec = opts.second != null ? `:${pad(opts.second)}` : '';
  if (opts.hour12) return { time: `${hour % 12 || 12}:${pad(minute)}${sec}`, suffix: hour < 12 ? 'AM' : 'PM' };
  return { time: `${pad(hour)}:${pad(minute)}${sec}`, suffix: '' };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatDate(p: ZonedParts): string {
  return `${p.weekday}, ${MONTHS[p.month - 1]} ${p.day}`;
}

/** Parses "HH:MM[:SS]" (a bare wall-clock time) or an ISO date-time. */
export function parseTime(input: string): { date: Date } | { hour: number; minute: number; second: number } | null {
  const bare = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(input.trim());
  if (bare) {
    const [hour, minute, second] = [Number(bare[1]), Number(bare[2]), Number(bare[3] ?? 0)];
    return hour < 24 && minute < 60 && second < 60 ? { hour, minute, second } : null;
  }
  const t = Date.parse(input);
  return Number.isNaN(t) ? null : { date: new Date(t) };
}
