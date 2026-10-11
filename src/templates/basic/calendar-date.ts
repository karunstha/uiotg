import { z } from 'zod';
import { html } from '../../core/html.ts';
import { icon } from '../../core/icons.ts';
import { defineTemplate } from '../../core/types.ts';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const calendarDate = defineTemplate({
  id: 'calendar_date',
  title: 'Calendar date',
  category: 'basic',
  photo: 'title',
  description:
    'A tear-off calendar page for one date (month band, big day number, weekday), optionally beside an event title, time and location. Use for "save the date", due dates and reminders.',
  schema: z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD'),
    title: z.string().max(120).optional().describe('Event name; without it only the calendar page renders'),
    time: z.string().max(40).optional().describe('e.g. "9:00 – 10:30 AM"'),
    location: z.string().max(120).optional(),
    caption: z.string().max(200).optional(),
  }),
  example: { date: '2026-10-21', title: 'Product launch', time: '9:00 AM PT', location: 'Livestream + HQ atrium', caption: 'Doors open at 8:30' },
  width: (d) => (d.title ? 520 : 196),
  css: /* css */ `
.dt{display:flex;gap:22px;align-items:center}
.dt-page{width:132px;flex:none;border-radius:calc(16px * var(--rk));overflow:hidden;background:var(--surface);border:1px solid var(--border);
  box-shadow:0 1px 2px rgba(0,0,0,.05),0 8px 24px -10px rgba(0,0,0,.25);text-align:center}
.dt-month{background:var(--accent);color:var(--on-accent);font-size:13px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;padding:7px 0}
.dt-day{font-size:60px;font-weight:700;letter-spacing:-0.04em;line-height:1;color:var(--text);padding:12px 0 4px}
.dt-wd{font-size:12px;font-weight:600;color:var(--text-2);padding-bottom:12px}
.dt-title{font-size:21px;font-weight:700;letter-spacing:-0.015em;color:var(--text);line-height:1.25}
.dt-meta{display:flex;flex-direction:column;gap:5px;margin-top:10px;font-size:14px;color:var(--text-2)}
.dt-meta span{display:flex;align-items:center;gap:7px}
.dt-meta .icon{color:var(--muted)}
.dt-cap{font-size:13px;color:var(--muted);margin-top:10px}
`,
  render(d) {
    const [y, m, day] = d.date.split('-').map(Number) as [number, number, number];
    const date = new Date(Date.UTC(y, m - 1, day));
    const page = html`<div class="dt-page">
      <div class="dt-month">${MONTHS[date.getUTCMonth()]} ${y}</div>
      <div class="dt-day">${date.getUTCDate()}</div>
      <div class="dt-wd">${DAYS[date.getUTCDay()]}</div>
    </div>`;
    if (!d.title) return html`<div class="dt" style="justify-content:center">${page}</div>`;
    return html`<div class="dt">
      ${page}
      <div>
        <div class="dt-title">${d.title}</div>
        ${d.time || d.location
          ? html`<div class="dt-meta">
              ${d.time ? html`<span>${icon('clock', { size: 15 })}${d.time}</span>` : null}
              ${d.location ? html`<span>${icon('map-pin', { size: 15 })}${d.location}</span>` : null}
            </div>`
          : null}
        ${d.caption ? html`<div class="dt-cap">${d.caption}</div>` : null}
      </div>
    </div>`;
  },
});
