import { z } from 'zod';
import { titleFields } from '../../core/format.ts';
import { html, style } from '../../core/html.ts';
import { icon } from '../../core/icons.ts';
import { seriesColor } from '../../core/theme.ts';
import { defineTemplate } from '../../core/types.ts';
import { header, legend } from '../../core/ui.ts';

export const agenda = defineTemplate({
  id: 'agenda',
  title: 'Agenda / schedule',
  summary: 'a day\'s schedule',
  category: 'data',
  photo: 'keyword',
  description:
    'A day or week agenda: time-ordered events with time range, location, attendees and a color per category. Use for calendars, itineraries, conference schedules and run-of-show.',
  schema: z.object({
    ...titleFields,
    events: z
      .array(
        z.object({
          start: z.string().max(20).describe('Display time, e.g. "09:30" or "9:30 AM"'),
          end: z.string().max(20).optional(),
          title: z.string().min(1).max(160),
          location: z.string().max(120).optional(),
          description: z.string().max(400).optional(),
          people: z.array(z.string().max(60)).max(12).optional().describe('Attendees or speakers'),
          category: z.string().max(40).optional().describe('Groups events by color, e.g. "Meetings", "Focus"'),
          status: z.enum(['confirmed', 'tentative', 'cancelled']).default('confirmed'),
          all_day: z.boolean().default(false),
        }),
      )
      .min(1)
      .max(40),
  }),
  example: {
    title: 'Thursday, October 9',
    subtitle: '5 events · 2 hours of focus time',
    events: [
      { start: 'All day', title: 'Design review week', category: 'Team', all_day: true },
      { start: '09:00', end: '09:15', title: 'Standup', location: 'Zoom', category: 'Team' },
      { start: '10:00', end: '12:00', title: 'Deep work: billing migration', category: 'Focus' },
      { start: '13:00', end: '13:45', title: '1:1 with Priya', location: 'Room 4B', people: ['Priya Shah'], category: 'Meetings' },
      { start: '15:30', end: '16:00', title: 'Vendor call', category: 'Meetings', status: 'tentative', people: ['Acme Corp'] },
      { start: '17:00', end: '17:30', title: 'Team retro', category: 'Team', status: 'cancelled' },
    ],
  },
  fit: 'content',
  minWidth: 320,
  width: 600,
  css: /* css */ `
.ag{display:flex;flex-direction:column;gap:8px}
.ag-ev{display:grid;grid-template-columns:72px 4px 1fr;column-gap:14px;padding:10px 0}
.ag-ev + .ag-ev{border-top:1px solid var(--grid)}
.ag-time{text-align:right;font-variant-numeric:tabular-nums;line-height:20px}
.ag-start{font-size:14px;font-weight:600;color:var(--text)}
.ag-end{font-size:12px;color:var(--muted)}
.ag-bar{border-radius:calc(2px * var(--rk))}
.ag-title{font-size:15px;font-weight:600;line-height:20px;color:var(--text);display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.ag-meta{margin-top:4px;display:flex;flex-wrap:wrap;gap:4px 14px;font-size:13px;color:var(--text-2)}
.ag-meta span{display:inline-flex;align-items:center;gap:5px}
.ag-meta .icon{color:var(--muted)}
.ag-desc{margin-top:4px;font-size:13px;color:var(--text-2)}
.ag-ev.tentative .ag-bar{opacity:.45}
.ag-ev.cancelled .ag-name{text-decoration:line-through;color:var(--muted)}
.ag-ev.cancelled .ag-bar{background:var(--axis)!important}
.ag-ev.allday .ag-start{font-size:12px;color:var(--text-2)}
`,
  render(d, ctx) {
    const categories = [...new Set(d.events.map((e) => e.category).filter((c): c is string => !!c))];
    const colorOf = (c?: string) => (c ? seriesColor(ctx.theme, categories.indexOf(c)) : ctx.theme.accent);
    return html`${header(d)}
    ${categories.length > 1 ? legend(categories.map((c) => ({ name: c, color: colorOf(c) }))) : null}
    <div class="ag">${d.events.map(
      (e) => html`<div class="${`ag-ev ${e.status}${e.all_day ? ' allday' : ''}`}">
        <div class="ag-time"><div class="ag-start">${e.start}</div>${e.end ? html`<div class="ag-end">${e.end}</div>` : null}</div>
        <div class="ag-bar" style="${style({ background: colorOf(e.category) })}"></div>
        <div>
          <div class="ag-title"><span class="ag-name">${e.title}</span>${e.status === 'tentative' ? html`<span class="tag">Tentative</span>` : null}${
            e.status === 'cancelled' ? html`<span class="tag">Cancelled</span>` : null
          }</div>
          ${e.location || e.people?.length
            ? html`<div class="ag-meta">
                ${e.location ? html`<span>${icon('map-pin', { size: 13 })}${e.location}</span>` : null}
                ${e.people?.length ? html`<span>${icon('users', { size: 13 })}${e.people.join(', ')}</span>` : null}
              </div>`
            : null}
          ${e.description ? html`<div class="ag-desc">${e.description}</div>` : null}
        </div>
      </div>`,
    )}</div>`;
  },
});
