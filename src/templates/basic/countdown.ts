import { z } from 'zod';
import { html } from '../../core/html.ts';
import { fitFontSize } from '../../core/measure.ts';
import { defineTemplate } from '../../core/types.ts';

const UNITS = ['days', 'hours', 'minutes', 'seconds'] as const;
type Unit = (typeof UNITS)[number];
const SECONDS: Record<Unit, number> = { days: 86_400, hours: 3_600, minutes: 60, seconds: 1 };

export const countdown = defineTemplate({
  id: 'countdown',
  title: 'Countdown',
  category: 'basic',
  photo: 'title',
  description:
    'Time remaining until an event as big number tiles (days / hours / minutes / seconds). Give a `target` date-time to compute it, or the numbers directly. Use for launches, deadlines and events.',
  schema: z
    .object({
      label: z.string().max(80).optional().describe('e.g. "Launch in" or the event name'),
      target: z.string().max(40).optional().describe('ISO date or date-time, e.g. "2026-12-31T23:59:00Z"'),
      now: z.string().max(40).optional().describe('Reference time for `target` (default: server time)'),
      days: z.number().int().min(0).optional(),
      hours: z.number().int().min(0).optional(),
      minutes: z.number().int().min(0).optional(),
      seconds: z.number().int().min(0).optional(),
      units: z.array(z.enum(UNITS)).min(1).max(4).default(['days', 'hours', 'minutes']),
      caption: z.string().max(160).optional(),
    })
    .refine((d) => d.target || UNITS.some((u) => d[u] != null), { message: 'Give a target date or at least one of days/hours/minutes/seconds' })
    .refine((d) => !d.target || !Number.isNaN(Date.parse(d.target)), { message: 'target must be an ISO date', path: ['target'] }),
  example: { label: 'Product launch in', days: 12, hours: 6, minutes: 42, caption: 'October 21, 2026 · 9:00 AM PT' },
  width: (d) => d.units.length * 112 + (d.units.length - 1) * 12 + 64,
  css: /* css */ `
.cd-label{font-size:13px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--text-2);margin-bottom:12px;text-align:center}
.cd-row{display:flex;gap:12px;justify-content:center}
.cd-tile{flex:1;background:var(--subtle);border-radius:calc(14px * var(--rk));padding:16px 8px 12px;text-align:center}
.cd-n{font-weight:700;letter-spacing:-0.03em;line-height:1;color:var(--text);font-variant-numeric:tabular-nums}
.cd-u{font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin-top:8px}
.cd-cap{font-size:13px;color:var(--text-2);margin-top:12px;text-align:center}
`,
  render(d, ctx) {
    const units = UNITS.filter((u) => d.units.includes(u));
    let values: Partial<Record<Unit, number>>;
    let ended = false;
    if (d.target) {
      const now = d.now ? Date.parse(d.now) : Date.now();
      let left = Math.max(0, Math.floor((Date.parse(d.target) - now) / 1000));
      ended = left === 0;
      values = {};
      // Larger units absorb the remainder of omitted ones (e.g. no "days" → hours can exceed 24).
      for (const u of units) {
        values[u] = Math.floor(left / SECONDS[u]);
        left -= values[u]! * SECONDS[u];
      }
    } else {
      values = { days: d.days, hours: d.hours, minutes: d.minutes, seconds: d.seconds };
    }
    const tileW = (ctx.width - (units.length - 1) * 12) / units.length - 16;
    const pad = (u: Unit, n: number) => (u === 'days' ? String(n) : String(n).padStart(2, '0'));
    return html`${d.label ? html`<div class="cd-label">${d.label}</div>` : null}
    <div class="cd-row">${units.map(
      (u) => html`<div class="cd-tile"><div class="cd-n" style="${`font-size:${fitFontSize(pad(u, values[u] ?? 0), tileW, 46, 18)}px`}">${pad(u, values[u] ?? 0)}</div><div class="cd-u">${(values[u] ?? 0) === 1 ? u.slice(0, -1) : u}</div></div>`,
    )}</div>
    ${d.caption || ended ? html`<div class="cd-cap">${ended ? 'This has started.' : d.caption}</div>` : null}`;
  },
});
