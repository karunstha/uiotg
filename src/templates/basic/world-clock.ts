import { z } from 'zod';
import { titleFields } from '../../core/format.ts';
import { html } from '../../core/html.ts';
import { icon } from '../../core/icons.ts';
import { formatClock, offsetMinutes, timeZoneSchema, zoneAbbreviation, zoned } from '../../core/time.ts';
import { defineTemplate } from '../../core/types.ts';
import { fitColumns, header } from '../../core/ui.ts';
import { analogFace } from './clock.ts';

function relativeOffset(minutes: number): string {
  if (minutes === 0) return 'Same time';
  const sign = minutes > 0 ? '+' : '−';
  const h = Math.floor(Math.abs(minutes) / 60);
  const m = Math.abs(minutes) % 60;
  return `${sign}${h}h${m ? ` ${m}m` : ''}`;
}

export const worldClock = defineTemplate({
  id: 'world_clock',
  title: 'World clock',
  category: 'basic',
  description:
    'Current time in several cities at once, each with day/night, the day relative to home (Today / Tomorrow / Yesterday) and the hour difference. Use for distributed teams, travel and scheduling across time zones.',
  schema: z.object({
    ...titleFields,
    cities: z.array(z.object({ name: z.string().min(1).max(60), timezone: timeZoneSchema })).min(1).max(16),
    home: timeZoneSchema.optional().describe('Zone that differences are relative to; defaults to the first city'),
    at: z
      .string()
      .max(40)
      .refine((s) => !Number.isNaN(Date.parse(s)), { message: 'Expected an ISO date-time, e.g. 2026-10-09T14:30:00Z' })
      .optional()
      .describe('ISO date-time to show instead of now'),
    style: z.enum(['list', 'analog']).default('list'),
    hour12: z.boolean().default(false),
  }),
  example: {
    title: 'Team time zones',
    at: '2026-10-09T14:30:00Z',
    cities: [
      { name: 'San Francisco', timezone: 'America/Los_Angeles' },
      { name: 'New York', timezone: 'America/New_York' },
      { name: 'London', timezone: 'Europe/London' },
      { name: 'Bengaluru', timezone: 'Asia/Kolkata' },
      { name: 'Tokyo', timezone: 'Asia/Tokyo' },
      { name: 'Sydney', timezone: 'Australia/Sydney' },
    ],
  },
  fit: 'content',
  minWidth: 360,
  width: (d) => (d.style === 'analog' ? 760 : 560),
  css: /* css */ `
.wc-list{display:flex;flex-direction:column}
.wc-row{display:flex;align-items:center;gap:14px;padding:12px 0}
.wc-row + .wc-row{border-top:1px solid var(--grid)}
.wc-ico{width:34px;height:34px;border-radius:50%;flex:none;display:flex;align-items:center;justify-content:center}
.wc-ico.day{background:color-mix(in srgb, #eda100 16%, var(--surface));color:#c98500}
.wc-ico.night{background:color-mix(in srgb, #4a3aa7 16%, var(--surface));color:#7d6fe0}
.wc-main{flex:1;min-width:0}
.wc-name{font-size:16px;font-weight:620;color:var(--text)}
.wc-meta{font-size:13px;color:var(--text-2);margin-top:1px}
.wc-time{font-size:30px;font-weight:620;letter-spacing:-0.03em;color:var(--text);font-variant-numeric:tabular-nums;text-align:right;line-height:1.1}
.wc-sfx{font-size:13px;font-weight:600;color:var(--text-2);margin-left:3px;letter-spacing:0}
.wc-grid{display:grid;gap:22px 16px}
.wc-cell{display:flex;flex-direction:column;align-items:center;gap:8px;text-align:center;min-width:0}
.wc-cell .wc-time{font-size:20px;text-align:center}
`,
  render(d, ctx) {
    const now = d.at ? new Date(d.at) : new Date();
    const home = d.home ?? d.cities[0]!.timezone;
    const homeParts = zoned(now, home);
    const homeDay = Date.UTC(homeParts.year, homeParts.month - 1, homeParts.day);
    const homeOffset = offsetMinutes(now, home);
    const rows = d.cities.map((c) => {
      const p = zoned(now, c.timezone);
      const dayDiff = Math.round((Date.UTC(p.year, p.month - 1, p.day) - homeDay) / 86_400_000);
      const day = dayDiff === 0 ? 'Today' : dayDiff === 1 ? 'Tomorrow' : dayDiff === -1 ? 'Yesterday' : p.weekday;
      const diff = offsetMinutes(now, c.timezone) - homeOffset;
      // The home city shows its date; the others show how far ahead or behind they are.
      const isHome = c.timezone === home;
      const meta = isHome ? `${p.weekday} · ${zoneAbbreviation(now, c.timezone)}` : `${day}, ${relativeOffset(diff)} · ${zoneAbbreviation(now, c.timezone)}`;
      return { ...c, p, night: p.hour < 6 || p.hour >= 19, meta };
    });

    if (d.style === 'analog') {
      const cols = fitColumns(Math.min(4, rows.length), ctx.width, 150);
      const face = Math.min(150, (ctx.width - (cols - 1) * 16) / cols - 10);
      return html`${header(d)}<div class="wc-grid" style="${`grid-template-columns:repeat(${cols}, minmax(0, 1fr))`}">${rows.map((r) => {
        const { time, suffix } = formatClock(r.p.hour, r.p.minute, { hour12: d.hour12 });
        return html`<div class="wc-cell">
          ${analogFace(r.p.hour, r.p.minute, null, Math.round(face), ctx.theme, r.night)}
          <div><div class="wc-name">${r.name}</div><div class="wc-time">${time}${suffix ? html`<span class="wc-sfx">${suffix}</span>` : null}</div><div class="wc-meta">${r.meta}</div></div>
        </div>`;
      })}</div>`;
    }
    return html`${header(d)}<div class="wc-list">${rows.map((r) => {
      const { time, suffix } = formatClock(r.p.hour, r.p.minute, { hour12: d.hour12 });
      return html`<div class="wc-row">
        <span class="${`wc-ico ${r.night ? 'night' : 'day'}`}">${icon(r.night ? 'moon' : 'sun', { size: 17 })}</span>
        <div class="wc-main"><div class="wc-name">${r.name}</div><div class="wc-meta">${r.meta}</div></div>
        <div class="wc-time">${time}${suffix ? html`<span class="wc-sfx">${suffix}</span>` : null}</div>
      </div>`;
    })}</div>`;
  },
});
