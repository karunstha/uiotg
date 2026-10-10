import { z } from 'zod';
import { display, formatSchema, iconSchema, makeFormatter, statusSchema, titleFields } from '../../core/format.ts';
import { html, style } from '../../core/html.ts';
import { icon } from '../../core/icons.ts';
import { fitFontSize } from '../../core/measure.ts';
import { defineTemplate } from '../../core/types.ts';
import { delta, fitColumns, header, sparkline, statusBadge, textDelta } from '../../core/ui.ts';

const itemSchema = z.object({
  label: z.string().min(1).max(80).describe('Sentence case, no trailing colon'),
  value: z.union([z.number(), z.string()]),
  format: formatSchema.optional(),
  delta: z
    .union([z.number(), z.string()])
    .optional()
    .describe('Change vs a previous period. Numbers are percent changes (12.5 → +12.5%) unless delta_format is set; strings like "+3 pts" are shown as-is'),
  delta_format: formatSchema.optional(),
  delta_label: z.string().max(40).optional().describe('e.g. "vs last week"'),
  good_when: z.enum(['up', 'down']).default('up').describe('Whether an increase is good news (revenue) or bad (latency, churn)'),
  trend: z.array(z.number()).min(2).max(200).optional().describe('Recent values for a sparkline, oldest first'),
  icon: iconSchema.optional(),
  status: statusSchema.optional(),
  caption: z.string().max(120).optional().describe('Muted footnote'),
});

function columnsFor(n: number, requested?: number): number {
  if (requested) return Math.min(requested, n);
  if (n <= 4) return n;
  return n % 3 === 0 && n <= 6 ? 3 : 4;
}

export const stats = defineTemplate({
  id: 'stats',
  title: 'KPI / stat tiles',
  category: 'data',
  description:
    'Headline numbers as stat tiles: label, value, signed delta colored by whether up is good, optional sparkline trend and status. A single item renders as a hero number. Use when the answer is a number, not a chart.',
  schema: z.object({
    ...titleFields,
    items: z.array(itemSchema).min(1).max(12),
    columns: z.number().int().min(1).max(6).optional(),
  }),
  example: {
    title: 'Product health',
    subtitle: 'Last 30 days',
    items: [
      { label: 'Monthly active users', value: 128_400, format: 'compact', delta: 8.2, delta_label: 'vs last month', trend: [96, 99, 101, 104, 103, 108, 112, 115, 113, 119, 124, 128] },
      { label: 'Revenue', value: 4_210_000, format: 'currency_compact', delta: 12.5, delta_label: 'vs last month', trend: [3.1, 3.2, 3.4, 3.3, 3.6, 3.7, 3.8, 3.9, 3.9, 4.0, 4.1, 4.2] },
      { label: 'p95 latency', value: 212, format: { suffix: ' ms' }, delta: 6.1, good_when: 'down', delta_label: 'vs last month', trend: [180, 176, 190, 185, 192, 199, 204, 201, 207, 210, 215, 212] },
      { label: 'Churn', value: 0.018, format: 'percent', delta: '−0.4 pts', good_when: 'down', delta_label: 'vs last month', trend: [2.6, 2.5, 2.4, 2.4, 2.3, 2.2, 2.2, 2.1, 2.0, 1.9, 1.9, 1.8] },
    ],
  },
  embed: 'bare',
  width: (d) => {
    if (d.items.length === 1) return 440;
    const cols = columnsFor(d.items.length, d.columns);
    return Math.min(1280, cols * 236 + (cols - 1) * 16 + 64);
  },
  css: /* css */ `
.st-grid{display:grid;gap:16px}
.st{border:1px solid var(--border);border-radius:14px;padding:18px 18px 16px;display:flex;flex-direction:column;gap:6px;
  background:var(--surface);min-width:0}
.st-label{display:flex;align-items:center;gap:7px;font-size:13px;font-weight:500;color:var(--text-2)}
.st-label .icon{color:var(--muted)}
.st-value{line-height:1.15;font-weight:620;letter-spacing:-0.022em;color:var(--text)}
.st-foot{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;min-height:20px}
.st-caption{font-size:12px;color:var(--muted)}
.st-spark{margin-top:8px}
.st.hero{border:0;padding:0;gap:10px}
.st.hero .st-label{font-size:15px}
.st.hero .st-value{line-height:1.05;letter-spacing:-0.035em}
.st.hero .delta{font-size:15px}
`,
  render(d, ctx) {
    const hero = d.items.length === 1;
    const minimal = ctx.detail === 'minimal';
    // Tiles reflow to fewer columns rather than squeeze below a readable width.
    const cols = fitColumns(columnsFor(d.items.length, d.columns), ctx.width, 168);
    const tileWidth = hero ? ctx.width : (ctx.width - (cols - 1) * 16) / cols - 36;
    // Big numbers stay on one line: shrink the type until the value fits its tile.
    const valueSize = (text: string) => fitFontSize(text, tileWidth, hero ? 64 : 32, 16);
    return html`${header(d)}<div class="st-grid" style="${`grid-template-columns:repeat(${cols}, minmax(0, 1fr))`}">${d.items.map((it) => {
      const fmt = makeFormatter(it.format);
      let change = null;
      if (typeof it.delta === 'number') {
        change = delta(it.delta, makeFormatter(it.delta_format ?? { suffix: '%', decimals: Math.abs(it.delta) < 10 ? 1 : 0 }), it.good_when, minimal ? undefined : it.delta_label);
      } else if (typeof it.delta === 'string') {
        change = textDelta(it.delta, it.good_when, minimal ? undefined : it.delta_label);
      }
      return html`<div class="${`st${hero ? ' hero' : ''}`}">
        <div class="st-label">${icon(it.icon, { size: 15 })}${it.label}</div>
        <div class="st-value" style="${`font-size:${valueSize(display(it.value, fmt))}px`}">${display(it.value, fmt)}</div>
        ${change || it.status ? html`<div class="st-foot">${change}${it.status ? statusBadge(it.status) : null}</div>` : null}
        ${it.caption && !minimal ? html`<div class="st-caption">${it.caption}</div>` : null}
        ${it.trend && !minimal
          ? html`<div class="st-spark" style="${style({ height: hero ? 64 : 40 })}">${sparkline(it.trend, { width: Math.max(60, Math.floor(tileWidth)), height: hero ? 64 : 40, theme: ctx.theme })}</div>`
          : null}
      </div>`;
    })}</div>`;
  },
});
