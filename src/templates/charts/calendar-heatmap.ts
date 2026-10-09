import { z } from 'zod';
import { formatSchema, makeFormatter, titleFields } from '../../core/format.ts';
import { escapeHtml, html, raw, style } from '../../core/html.ts';
import { defineTemplate } from '../../core/types.ts';
import { header } from '../../core/ui.ts';

const DAY = 86_400_000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');

function parseDay(s: string): number {
  const [y, m, d] = s.split('-').map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d) / DAY;
}

function fmtDay(day: number): string {
  const d = new Date(day * DAY);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

export const calendarHeatmap = defineTemplate({
  id: 'calendar_heatmap',
  title: 'Calendar heatmap',
  category: 'chart',
  description:
    'GitHub-style contribution calendar: one cell per day over up to a year, shaded by value, with totals and streaks. Use for activity, habits, commits, sales per day.',
  schema: z.object({
    ...titleFields,
    values: z.array(z.object({ date: isoDate, value: z.number() })).max(1200).describe('Daily values; missing days count as zero'),
    start: isoDate.optional().describe('First day shown; default 52 weeks before `end`'),
    end: isoDate.optional().describe('Last day shown; default the latest date in `values`'),
    week_start: z.enum(['sunday', 'monday']).default('sunday'),
    unit: z.string().max(30).default('contributions').describe('Plural noun for the summary line'),
    format: formatSchema.optional(),
  }),
  example: (() => {
    // Deterministic pseudo-random year of activity ending 2026-10-09.
    const end = Date.UTC(2026, 9, 9) / DAY;
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const values = [];
    for (let day = end - 364; day <= end; day++) {
      const dow = new Date(day * DAY).getUTCDay();
      const weekend = dow === 0 || dow === 6;
      const r = rand();
      const v = r < (weekend ? 0.6 : 0.18) ? 0 : Math.round((weekend ? 2 : 6) * rand() * (1 + Math.sin(day / 40)) + rand() * 3);
      values.push({ date: new Date(day * DAY).toISOString().slice(0, 10), value: v });
    }
    return { title: 'Commits', subtitle: 'uiotg repository, last 12 months', values, unit: 'commits' };
  })(),
  width: 860,
  css: /* css */ `
.cal-foot{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-top:12px;font-size:12px;color:var(--text-2)}
.cal-foot b{color:var(--text);font-weight:600}
.cal-legend{display:flex;align-items:center;gap:4px;color:var(--muted)}
.cal-legend i{display:inline-block;width:11px;height:11px;border-radius:2px}
`,
  render(d, ctx) {
    const { theme } = ctx;
    const fmt = makeFormatter(d.format);
    const byDay = new Map<number, number>();
    for (const v of d.values) byDay.set(parseDay(v.date), (byDay.get(parseDay(v.date)) ?? 0) + v.value);
    const days = [...byDay.keys()];
    const end = d.end ? parseDay(d.end) : days.length ? Math.max(...days) : Math.floor(Date.now() / DAY);
    const start = d.start ? parseDay(d.start) : end - 52 * 7 - new Date(end * DAY).getUTCDay();
    const weekStart = d.week_start === 'monday' ? 1 : 0;
    const dow = (day: number) => (new Date(day * DAY).getUTCDay() - weekStart + 7) % 7;
    const first = start - dow(start);
    const weeks = Math.floor((end - first) / 7) + 1;

    // Quartile thresholds over non-zero days → four color levels.
    const nonzero = [...byDay.entries()].filter(([k, v]) => k >= start && k <= end && v > 0).map(([, v]) => v).sort((a, b) => a - b);
    const q = (p: number) => nonzero[Math.min(nonzero.length - 1, Math.floor(p * nonzero.length))] ?? 0;
    const cuts = [q(0.25), q(0.5), q(0.75)];
    const levels = [theme.subtle, theme.ordinal[0]!, theme.ordinal[1]!, theme.ordinal[2]!, theme.ordinal[4]!];
    const level = (v: number) => (v <= 0 ? 0 : v <= cuts[0]! ? 1 : v <= cuts[1]! ? 2 : v <= cuts[2]! ? 3 : 4);

    const labelW = 30;
    const monthH = 18;
    const gap = 3;
    const cell = Math.max(6, Math.min(22, Math.floor((ctx.width - labelW) / weeks) - gap));
    const pitch = cell + gap;
    const width = labelW + weeks * pitch;
    const height = monthH + 7 * pitch;

    const parts: string[] = [];
    let lastMonthCol = -10;
    for (let w = 0; w < weeks; w++) {
      for (let r = 0; r < 7; r++) {
        const day = first + w * 7 + r;
        if (day < start || day > end) continue;
        const v = byDay.get(day) ?? 0;
        parts.push(
          `<rect x="${labelW + w * pitch}" y="${monthH + r * pitch}" width="${cell}" height="${cell}" rx="2" fill="${levels[level(v)]}"/>`,
        );
        const date = new Date(day * DAY);
        if (date.getUTCDate() === 1 && w - lastMonthCol >= 3) {
          lastMonthCol = w;
          parts.push(`<text x="${labelW + w * pitch}" y="11" font-size="11" fill="${theme.muted}">${MONTHS[date.getUTCMonth()]}</text>`);
        }
      }
    }
    const weekdayNames = weekStart === 1 ? ['Mon', '', 'Wed', '', 'Fri', '', ''] : ['', 'Mon', '', 'Wed', '', 'Fri', ''];
    weekdayNames.forEach((n, r) => {
      if (n) parts.push(`<text x="0" y="${monthH + r * pitch + cell - 1}" font-size="10" fill="${theme.muted}">${escapeHtml(n)}</text>`);
    });

    // Summary: total and longest streak within the range.
    let total = 0;
    let streak = 0;
    let longest = 0;
    let best = { day: start, value: -Infinity };
    for (let day = start; day <= end; day++) {
      const v = byDay.get(day) ?? 0;
      total += v;
      streak = v > 0 ? streak + 1 : 0;
      longest = Math.max(longest, streak);
      if (v > best.value) best = { day, value: v };
    }

    return html`${header(d)}
    <div style="${style({ width: Math.min(width, ctx.width) })}">
      ${raw(`<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" style="font-family:inherit" aria-hidden="true">${parts.join('')}</svg>`)}
    </div>
    <div class="cal-foot">
      <span><b>${fmt(total)}</b> ${d.unit} · longest streak <b>${longest}</b> days · best day <b>${fmt(best.value)}</b> on ${fmtDay(best.day)}</span>
      <span class="cal-legend">Less ${levels.map((c) => html`<i style="${style({ background: c })}"></i>`)} More</span>
    </div>`;
  },
});
