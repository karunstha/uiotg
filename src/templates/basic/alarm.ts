import { z } from 'zod';
import { html, style } from '../../core/html.ts';
import { icon } from '../../core/icons.ts';
import { fitFontSize } from '../../core/measure.ts';
import { formatClock, timeZoneSchema, zoned } from '../../core/time.ts';
import { defineTemplate } from '../../core/types.ts';
import { header } from '../../core/ui.ts';

const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
type Day = (typeof DAYS)[number];
const DAY_NAMES: Record<Day, string> = { sun: 'Sun', mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat' };
const WEEKDAY_INDEX: Record<string, number> = { Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6 };

const alarmSchema = z.object({
  time: z.string().regex(/^([01]?\d|2[0-3]):[0-5]\d$/, 'Expected 24-hour "HH:MM"').describe('24-hour "HH:MM", e.g. "07:00"'),
  label: z.string().max(60).optional(),
  repeat: z
    .union([z.enum(['once', 'daily', 'weekdays', 'weekends']), z.array(z.enum(DAYS)).min(1).max(7)])
    .default('once')
    .describe('"once", "daily", "weekdays", "weekends" or days like ["mon","wed","fri"]'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('For one-off alarms: the day it rings'),
  enabled: z.boolean().default(true),
  sound: z.string().max(40).optional(),
});
type Alarm = z.infer<typeof alarmSchema>;

function days(a: Alarm): Set<number> {
  if (Array.isArray(a.repeat)) return new Set(a.repeat.map((d) => DAYS.indexOf(d)));
  if (a.repeat === 'daily') return new Set([0, 1, 2, 3, 4, 5, 6]);
  if (a.repeat === 'weekdays') return new Set([1, 2, 3, 4, 5]);
  if (a.repeat === 'weekends') return new Set([0, 6]);
  return new Set();
}

function repeatText(a: Alarm): string {
  if (Array.isArray(a.repeat)) return a.repeat.length === 7 ? 'Every day' : a.repeat.map((d) => DAY_NAMES[d]).join(', ');
  return { once: a.date ? `Once · ${a.date}` : 'Once', daily: 'Every day', weekdays: 'Weekdays', weekends: 'Weekends' }[a.repeat];
}

/** Minutes until the alarm next rings, from a wall-clock "now"; null if it won't ring again. */
function minutesUntil(a: Alarm, now: { weekday: number; minutes: number; day: number }): number | null {
  if (!a.enabled) return null;
  const [h, m] = a.time.split(':').map(Number) as [number, number];
  const at = h * 60 + m;
  if (a.repeat === 'once') {
    if (a.date) {
      const [y, mo, d] = a.date.split('-').map(Number) as [number, number, number];
      const diff = (Date.UTC(y, mo - 1, d) / 86_400_000 - now.day) * 1440 + at - now.minutes;
      return diff > 0 ? diff : null;
    }
    return at > now.minutes ? at - now.minutes : at + 1440 - now.minutes;
  }
  const allowed = days(a);
  for (let k = 0; k <= 7; k++) {
    if (allowed.has((now.weekday + k) % 7) && (k > 0 || at > now.minutes)) return k * 1440 + at - now.minutes;
  }
  return null;
}

function inText(minutes: number): string {
  const d = Math.floor(minutes / 1440);
  const h = Math.floor((minutes % 1440) / 60);
  const m = minutes % 60;
  if (d >= 1) return `in ${d} day${d === 1 ? '' : 's'}${h ? ` ${h} h` : ''}`;
  return h ? `in ${h} h ${m} min` : `in ${m} min`;
}

export const alarm = defineTemplate({
  id: 'alarm',
  title: 'Alarm',
  category: 'basic',
  description:
    'One alarm or a list of alarms: time, label, repeat days, on/off state and when the next one rings ("in 8 h 42 min"). Use to confirm an alarm was set or to show what is scheduled.',
  schema: z.object({
    title: z.string().max(80).optional(),
    alarms: z.array(alarmSchema).min(1).max(20),
    timezone: timeZoneSchema.optional().describe('Zone the alarm times are in (for "rings in"); default UTC'),
    now: z
      .string()
      .max(40)
      .refine((s) => !Number.isNaN(Date.parse(s)), { message: 'Expected an ISO date-time' })
      .optional()
      .describe('Reference time for "rings in"; default is now'),
    hour12: z.boolean().default(false),
  }),
  example: {
    title: 'Alarms',
    timezone: 'Europe/London',
    now: '2026-10-09T22:48:00Z',
    alarms: [
      { time: '07:00', label: 'Work', repeat: 'weekdays', sound: 'Radar' },
      { time: '08:30', label: 'Long run', repeat: 'weekends' },
      { time: '05:15', label: 'Airport', repeat: 'once', date: '2026-10-14', enabled: false },
    ],
  },
  width: (d) => (d.alarms.length === 1 ? 420 : 480),
  fit: 'content',
  minWidth: 320,
  css: /* css */ `
.am-next{display:flex;align-items:center;gap:10px;padding:12px 14px;border-radius:12px;background:var(--subtle);margin-bottom:14px;font-size:14px;color:var(--text-2)}
.am-next b{color:var(--text);font-weight:620}
.am-next .icon{color:var(--accent);flex:none}
.am-row{display:flex;align-items:center;gap:16px;padding:12px 0}
.am-row + .am-row{border-top:1px solid var(--grid)}
.am-time{font-size:34px;font-weight:600;letter-spacing:-0.03em;color:var(--text);line-height:1.1;font-variant-numeric:tabular-nums}
.am-sfx{font-size:14px;font-weight:600;color:var(--text-2);margin-left:4px;letter-spacing:0}
.am-main{flex:1;min-width:0}
.am-label{font-size:14px;font-weight:600;color:var(--text)}
.am-rep{font-size:13px;color:var(--text-2);margin-top:1px}
.am-state{font-size:12px;font-weight:650;padding:3px 9px;border-radius:999px;white-space:nowrap}
.am-state.am-on{background:color-mix(in srgb, var(--accent) 14%, var(--surface));color:var(--accent)}
.am-state.am-off{background:var(--subtle);color:var(--muted)}
.am-row.am-dis .am-time,.am-row.am-dis .am-label{color:var(--muted)}
.am-hero{display:flex;flex-direction:column;align-items:center;text-align:center;gap:4px}
.am-hero .am-ico{width:44px;height:44px;border-radius:50%;display:flex;align-items:center;justify-content:center;margin-bottom:6px;
  background:color-mix(in srgb, var(--accent) 14%, var(--surface));color:var(--accent)}
.am-hero.am-dis .am-ico{background:var(--subtle);color:var(--muted)}
.am-hero .am-time{line-height:1.05}
.am-hero .am-label{font-size:16px;margin-top:6px}
.am-hero .am-rep{font-size:14px}
.am-in{font-size:14px;font-weight:600;color:var(--accent);margin-top:8px}
.am-meta{display:inline-flex;align-items:center;gap:5px;font-size:13px;color:var(--muted);margin-top:4px}
`,
  render(d, ctx) {
    const ref = d.now ? new Date(d.now) : new Date();
    const p = zoned(ref, d.timezone ?? 'UTC');
    const now = { weekday: WEEKDAY_INDEX[p.weekday] ?? 0, minutes: p.hour * 60 + p.minute, day: Date.UTC(p.year, p.month - 1, p.day) / 86_400_000 };
    const clock = (a: Alarm) => {
      const [h, m] = a.time.split(':').map(Number) as [number, number];
      return formatClock(h, m, { hour12: d.hour12 });
    };

    if (d.alarms.length === 1) {
      const a = d.alarms[0]!;
      const { time, suffix } = clock(a);
      const until = minutesUntil(a, now);
      return html`<div class="${`am-hero${a.enabled ? '' : ' am-dis'}`}">
        <span class="am-ico">${icon(a.enabled ? 'alarm-clock' : 'alarm-clock-off', { size: 22 })}</span>
        ${d.title ? html`<div class="am-rep">${d.title}</div>` : null}
        <div class="am-time" style="${style({ 'font-size': fitFontSize(`${time} PM`, ctx.width, 64, 28) })}">${time}${suffix ? html`<span class="am-sfx">${suffix}</span>` : null}</div>
        ${a.label ? html`<div class="am-label">${a.label}</div>` : null}
        <div class="am-rep">${repeatText(a)}</div>
        ${until != null ? html`<div class="am-in">Rings ${inText(until)}</div>` : html`<div class="am-in" style="color:var(--muted)">Off</div>`}
        ${a.sound ? html`<span class="am-meta">${icon('bell', { size: 13 })}${a.sound}</span>` : null}
      </div>`;
    }

    const next = d.alarms
      .map((a) => ({ a, until: minutesUntil(a, now) }))
      .filter((x): x is { a: Alarm; until: number } => x.until != null)
      .sort((x, y) => x.until - y.until)[0];
    const nextClock = next ? clock(next.a) : null;
    return html`${header(d)}
    ${next && nextClock
      ? html`<div class="am-next">${icon('alarm-clock', { size: 16 })}<span>Next alarm <b>${inText(next.until)}</b> · ${nextClock.time}${nextClock.suffix ? ` ${nextClock.suffix}` : ''}${next.a.label ? ` · ${next.a.label}` : ''}</span></div>`
      : html`<div class="am-next">${icon('alarm-clock-off', { size: 16 })}<span>No alarms on</span></div>`}
    <div class="am-list">${d.alarms.map((a) => {
      const { time, suffix } = clock(a);
      return html`<div class="${`am-row${a.enabled ? '' : ' am-dis'}`}">
        <div class="am-time">${time}${suffix ? html`<span class="am-sfx">${suffix}</span>` : null}</div>
        <div class="am-main">${a.label ? html`<div class="am-label">${a.label}</div>` : null}<div class="am-rep">${repeatText(a)}${a.sound ? ` · ${a.sound}` : ''}</div></div>
        <span class="${`am-state ${a.enabled ? 'am-on' : 'am-off'}`}">${a.enabled ? 'On' : 'Off'}</span>
      </div>`;
    })}</div>`;
  },
});
