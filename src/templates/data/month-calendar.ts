import { z } from 'zod';
import { html, style } from '../../core/html.ts';
import { seriesColor } from '../../core/theme.ts';
import { defineTemplate } from '../../core/types.ts';
import { header, legend } from '../../core/ui.ts';

const DAY = 86_400_000;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');

const dayNum = (s: string) => {
  const [y, m, d] = s.split('-').map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d) / DAY;
};

export const monthCalendar = defineTemplate({
  id: 'month_calendar',
  title: 'Month calendar',
  category: 'data',
  description:
    'A month grid with events on their days (multi-day events span their range), colored by category, with today highlighted. Use for schedules, release plans, rotas, holidays and "what does my month look like".',
  schema: z.object({
    month: z.string().regex(/^\d{4}-\d{2}$/, 'Expected YYYY-MM'),
    title: z.string().max(120).optional().describe('Defaults to the month name'),
    subtitle: z.string().max(300).optional(),
    events: z
      .array(
        z.object({
          date: isoDate,
          end: isoDate.optional().describe('Last day for multi-day events'),
          title: z.string().min(1).max(80),
          time: z.string().max(12).optional().describe('e.g. "9:30"'),
          category: z.string().max(40).optional(),
        }),
      )
      .max(300),
    week_start: z.enum(['monday', 'sunday']).default('monday'),
    today: isoDate.optional(),
    max_per_day: z.number().int().min(1).max(8).default(3),
  }),
  example: {
    month: '2026-10',
    today: '2026-10-09',
    events: [
      { date: '2026-10-01', title: 'Q4 kickoff', time: '10:00', category: 'Team' },
      { date: '2026-10-06', end: '2026-10-08', title: 'Design review week', category: 'Team' },
      { date: '2026-10-09', title: '1:1 with Priya', time: '13:00', category: 'Meetings' },
      { date: '2026-10-09', title: 'Vendor call', time: '15:30', category: 'Meetings' },
      { date: '2026-10-13', title: 'Pen-test report due', category: 'Deadlines' },
      { date: '2026-10-15', title: 'Board prep', time: '9:00', category: 'Meetings' },
      { date: '2026-10-21', title: 'Product launch', time: '9:00', category: 'Launch' },
      { date: '2026-10-22', end: '2026-10-23', title: 'Offsite', category: 'Team' },
      { date: '2026-10-28', title: 'Release 2.5', category: 'Launch' },
      { date: '2026-10-30', title: 'Quarter retro', time: '16:00', category: 'Team' },
    ],
  },
  width: 980,
  css: /* css */ `
.mc{border:1px solid var(--border);border-radius:12px;overflow:hidden}
.mc-grid{display:grid;grid-template-columns:repeat(7, minmax(0, 1fr))}
.mc-wd{font-size:11.5px;font-weight:650;letter-spacing:.06em;text-transform:uppercase;color:var(--text-2);padding:8px 10px;border-bottom:1px solid var(--grid)}
.mc-day{min-height:104px;padding:6px 6px 8px;border-right:1px solid var(--grid);border-bottom:1px solid var(--grid);min-width:0}
.mc-day:nth-child(7n){border-right:0}
.mc-day:nth-last-child(-n+7){border-bottom:0}
.mc-day.wkend{background:color-mix(in srgb, var(--subtle) 45%, transparent)}
.mc-day.out .mc-n{color:var(--muted);opacity:.6}
.mc-n{display:inline-flex;align-items:center;justify-content:center;min-width:24px;height:24px;padding:0 4px;border-radius:999px;font-size:13px;
  font-weight:600;color:var(--text);font-variant-numeric:tabular-nums;margin-bottom:3px}
.mc-day.today .mc-n{background:var(--accent);color:#fff}
.mc-ev{display:flex;align-items:center;gap:5px;font-size:11.5px;line-height:16px;padding:2px 6px;border-radius:5px;margin-top:2px;color:var(--text);
  min-width:0}
.mc-ev b{font-weight:600;color:var(--text-2);font-variant-numeric:tabular-nums}
.mc-more{font-size:11px;color:var(--text-2);padding:2px 6px;font-weight:500}
`,
  render(d, ctx) {
    const [y, m] = d.month.split('-').map(Number) as [number, number];
    const first = Date.UTC(y, m - 1, 1) / DAY;
    const last = Date.UTC(y, m, 0) / DAY;
    const ws = d.week_start === 'monday' ? 1 : 0;
    const dow = (day: number) => (new Date(day * DAY).getUTCDay() - ws + 7) % 7;
    const gridStart = first - dow(first);
    const gridEnd = last + (6 - dow(last));
    const today = d.today ? dayNum(d.today) : null;

    const categories = [...new Set(d.events.map((e) => e.category).filter((c): c is string => !!c))];
    const colorOf = (c?: string) => (c ? seriesColor(ctx.theme, categories.indexOf(c)) : ctx.theme.accent);
    const byDay = new Map<number, typeof d.events>();
    for (const e of d.events) {
      const start = dayNum(e.date);
      const end = e.end ? Math.max(start, dayNum(e.end)) : start;
      for (let day = start; day <= end && day - start < 62; day++) byDay.set(day, [...(byDay.get(day) ?? []), e]);
    }

    const weekdays = Array.from({ length: 7 }, (_, i) => WEEKDAYS[(i + ws) % 7]!);
    const cells = [];
    for (let day = gridStart; day <= gridEnd; day++) {
      const date = new Date(day * DAY);
      const events = (byDay.get(day) ?? []).slice().sort((a, b) => (a.time ?? '').localeCompare(b.time ?? ''));
      const shown = events.slice(0, events.length > d.max_per_day ? d.max_per_day - 1 : d.max_per_day);
      const wd = date.getUTCDay();
      const cls = `mc-day${day < first || day > last ? ' out' : ''}${wd === 0 || wd === 6 ? ' wkend' : ''}${day === today ? ' today' : ''}`;
      cells.push(html`<div class="${cls}"><span class="mc-n">${date.getUTCDate()}</span>${shown.map((e) => {
        const c = colorOf(e.category);
        return html`<div class="mc-ev" style="${style({ background: `color-mix(in srgb, ${c} 16%, var(--surface))`, 'box-shadow': `inset 3px 0 0 ${c}` })}">${
          e.time ? html`<b>${e.time}</b>` : null
        }${e.title}</div>`;
      })}${events.length > shown.length ? html`<div class="mc-more">+${events.length - shown.length} more</div>` : null}</div>`);
    }
    return html`${header({ title: d.title ?? `${MONTHS[m - 1]} ${y}`, subtitle: d.subtitle })}
    ${categories.length > 1 ? legend(categories.map((c) => ({ name: c, color: colorOf(c) }))) : null}
    <div class="mc"><div class="mc-grid">${weekdays.map((w) => html`<div class="mc-wd">${w}</div>`)}${cells}</div></div>`;
  },
});
