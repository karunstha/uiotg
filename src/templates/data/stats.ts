import { z } from 'zod';
import { display, formatSchema, iconSchema, makeFormatter, statusSchema, titleFields } from '../../core/format.ts';
import { html, style } from '../../core/html.ts';
import { icon } from '../../core/icons.ts';
import { fitFontSize } from '../../core/measure.ts';
import { defineTemplate } from '../../core/types.ts';
import { hiddenCount, keepFirst, moreLabel } from '../../core/truncate.ts';
import { CIRCLE_ROW, circleRow, delta, fitColumns, header, sparkline, statusBadge, textDelta } from '../../core/ui.ts';

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

/** The signed change under a value, colored by whether up is good. */
function change(it: z.output<typeof itemSchema>, withLabel: boolean) {
  if (typeof it.delta === 'number') {
    return delta(it.delta, makeFormatter(it.delta_format ?? { suffix: '%', decimals: Math.abs(it.delta) < 10 ? 1 : 0 }), it.good_when, withLabel ? it.delta_label : undefined);
  }
  if (typeof it.delta === 'string') return textDelta(it.delta, it.good_when, withLabel ? it.delta_label : undefined);
  return null;
}

function columnsFor(n: number, requested?: number): number {
  if (requested) return Math.min(requested, n);
  if (n <= 4) return n;
  return n % 3 === 0 && n <= 6 ? 3 : 4;
}

export const stats = defineTemplate({
  id: 'stats',
  title: 'KPI / stat tiles',
  summary: 'headline numbers, KPI tiles with deltas',
  category: 'data',
  photo: 'keyword',
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
.st{border:1px solid var(--border);border-radius:calc(14px * var(--rk));padding:18px 18px 16px;display:flex;flex-direction:column;gap:6px;
  background:var(--surface);min-width:0}
.st-label{display:flex;align-items:center;gap:7px;font-size:13px;font-weight:500;color:var(--text-2)}
.st-label .icon{color:var(--muted)}
.st-value{line-height:1.15;font-weight:620;letter-spacing:-0.022em;color:var(--text)}
.st-foot{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;min-height:20px}
.st-caption{font-size:12px;color:var(--muted)}
.st-spark{margin-top:8px}
.st.st-hero{border:0;padding:0;gap:10px}
.st.st-hero .st-label{font-size:15px}
.st.st-hero .st-value{line-height:1.05;letter-spacing:-0.035em}
.st.st-hero .delta{font-size:15px}
`,
  circleCss: /* css */ `
.st-rhead{margin-bottom:10px}
.st-rhead .hdr-title{font-size:15px}
.st-r{display:flex;flex-direction:column;align-items:center;gap:2px}
.st-r+.st-r{margin-top:12px}
.st-r .st-label{justify-content:center;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}
.st-r .st-value{line-height:1.1;white-space:nowrap}
.st-r .st-foot{justify-content:center;min-height:0;gap:10px;font-size:13px}
.st-rline{display:flex;align-items:baseline;justify-content:center;gap:10px}
.st-rh .st-label{font-size:16px}
.st-rh .st-value{line-height:1.05;letter-spacing:-0.035em}
.st-rh .st-foot .delta{font-size:15px}
.st-rh .st-spark{margin-top:6px}
.st-more{font-size:13px;color:var(--text-2);margin-top:12px}
`,
  truncateCircle: (d, keep) => keepFirst(d, 'items', keep),
  renderCircle(d, ctx) {
    const R = ctx.circle.safe / 2;
    const minimal = ctx.detail === 'minimal';
    const hidden = hiddenCount(d);
    const hero = d.items.length === 1 && !hidden;
    // Two or three tiles get a line each for label, value and change; more get the change beside the value.
    const compact = d.items.length + (hidden ? 1 : 0) > 3;
    const valueSize = (text: string) => fitFontSize(text, hero ? R * 1.5 : compact ? R * 0.9 : R * 1.2, hero ? Math.round(R * 0.4) : compact ? 34 : 44, 16);
    const head = d.title || d.subtitle
      ? html`<div class="st-rhead">${d.title ? html`<div class="${circleRow('hdr-title')}">${d.title}</div>` : null}${d.subtitle ? html`<div class="${circleRow('hdr-sub')}">${d.subtitle}</div>` : null}</div>`
      : null;
    return html`${head}${d.items.map((it) => {
      const text = display(it.value, makeFormatter(it.format));
      const diff = change(it, !minimal && !compact);
      const foot = diff || it.status ? html`<div class="st-foot">${diff}${it.status ? statusBadge(it.status) : null}</div>` : null;
      const value = html`<div class="st-value" style="${`font-size:${valueSize(text)}px`}">${text}</div>`;
      return html`<div class="${circleRow(`st-r${hero ? ' st-rh' : ''}`)}">
        <div class="st-label">${icon(it.icon, { size: 15 })}${it.label}</div>
        ${compact ? html`<div class="st-rline">${value}${foot}</div>` : html`${value}${foot}`}
        ${hero && it.trend && !minimal
          ? html`<div class="st-spark" style="${style({ height: 44 })}">${sparkline(it.trend, { width: Math.round(R), height: 44, theme: ctx.theme })}</div>`
          : null}
      </div>`;
    })}${hidden ? html`<div class="${`st-more ${CIRCLE_ROW}`}">${moreLabel(hidden)}</div>` : null}`;
  },
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
      const diff = change(it, !minimal);
      return html`<div class="${`st${hero ? ' st-hero' : ''}`}">
        <div class="st-label">${icon(it.icon, { size: 15 })}${it.label}</div>
        <div class="st-value" style="${`font-size:${valueSize(display(it.value, fmt))}px`}">${display(it.value, fmt)}</div>
        ${diff || it.status ? html`<div class="st-foot">${diff}${it.status ? statusBadge(it.status) : null}</div>` : null}
        ${it.caption && !minimal ? html`<div class="st-caption">${it.caption}</div>` : null}
        ${it.trend && !minimal
          ? html`<div class="st-spark" style="${style({ height: hero ? 64 : 40 })}">${sparkline(it.trend, { width: Math.max(60, Math.floor(tileWidth)), height: hero ? 64 : 40, theme: ctx.theme })}</div>`
          : null}
      </div>`;
    })}</div>`;
  },
});
