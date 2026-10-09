import { z } from 'zod';
import { formatSchema, makeFormatter, titleFields } from '../../core/format.ts';
import { html, style } from '../../core/html.ts';
import { inkOn, rampColor } from '../../core/theme.ts';
import { defineTemplate } from '../../core/types.ts';
import { header, headerHeight } from '../../core/ui.ts';
import { label, textWidth } from './common.ts';

export const heatmap = defineTemplate({
  id: 'heatmap',
  title: 'Heatmap',
  category: 'chart',
  description:
    'A matrix of values colored on a single-hue sequential scale (or a blue–red diverging scale around zero). Use for activity by day × hour, correlation matrices, cohort retention and any two-dimensional grid.',
  schema: z
    .object({
      ...titleFields,
      x: z.array(label).min(1).max(120).describe('Column labels'),
      y: z.array(label).min(1).max(80).describe('Row labels, top to bottom'),
      values: z.array(z.array(z.number().nullable())).describe('values[row][column]; null for empty cells'),
      scale: z.enum(['sequential', 'diverging']).default('sequential').describe('"diverging" centers on zero (or `mid`)'),
      min: z.number().optional(),
      max: z.number().optional(),
      mid: z.number().optional().describe('Diverging midpoint, default 0'),
      format: formatSchema.optional(),
      show_values: z.boolean().optional().describe('Print values in cells; default when cells are large enough'),
      cell_height: z.number().int().min(10).max(80).optional(),
    })
    .superRefine((d, ctx) => {
      if (d.values.length !== d.y.length)
        ctx.addIssue({ code: 'custom', path: ['values'], message: `Expected ${d.y.length} rows (one per y label), got ${d.values.length}` });
      d.values.forEach((row, i) => {
        if (row.length !== d.x.length)
          ctx.addIssue({ code: 'custom', path: ['values', i], message: `Row ${i} has ${row.length} values but there are ${d.x.length} x labels` });
      });
    }),
  example: {
    title: 'Support tickets by hour',
    subtitle: 'Average per day, last 4 weeks',
    x: ['6a', '8a', '10a', '12p', '2p', '4p', '6p', '8p', '10p'],
    y: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    values: [
      [4, 18, 31, 27, 29, 24, 14, 8, 3],
      [3, 16, 28, 25, 27, 22, 12, 7, 3],
      [3, 15, 26, 24, 26, 21, 12, 6, 2],
      [4, 17, 29, 26, 28, 23, 13, 7, 3],
      [3, 14, 24, 22, 21, 17, 10, 6, 4],
      [1, 4, 8, 11, 12, 10, 8, 6, 4],
      [1, 3, 6, 9, 10, 9, 7, 6, 3],
    ],
  },
  width: 760,
  css: /* css */ `
.hm{display:grid;gap:2px;align-items:center}
.hm-yl{font-size:12px;color:var(--text-2);padding-right:10px;text-align:right;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.hm-xl{font-size:11px;color:var(--muted);text-align:center;padding-top:6px;white-space:nowrap;overflow:hidden}
.hm-c{border-radius:3px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:500;
  font-variant-numeric:tabular-nums;overflow:hidden}
.hm-nil{background:var(--subtle);color:var(--muted)}
.hm-scale{display:flex;align-items:center;gap:8px;margin-top:16px;font-size:11px;color:var(--muted);font-variant-numeric:tabular-nums}
.hm-bar{width:160px;height:8px;border-radius:4px}
`,
  render(d, ctx) {
    const { theme } = ctx;
    const fmt = makeFormatter(d.format);
    const flat = d.values.flat().filter((v): v is number => v != null && Number.isFinite(v));
    const diverging = d.scale === 'diverging';
    const mid = d.mid ?? 0;
    let lo = d.min ?? Math.min(...flat);
    let hi = d.max ?? Math.max(...flat);
    if (diverging) {
      const reach = Math.max(Math.abs(hi - mid), Math.abs(mid - lo)) || 1;
      lo = mid - reach;
      hi = mid + reach;
    }
    if (!(hi > lo)) hi = lo + 1;
    const ramp = diverging ? theme.diverging : theme.sequential;
    const colorOf = (v: number) => rampColor(ramp, (v - lo) / (hi - lo));

    const yLabels = d.y.map(String);
    const xLabels = d.x.map(String);
    const yw = Math.ceil(Math.min(160, Math.max(...yLabels.map((l) => textWidth(l, 12))) + 14));
    const cellW = (ctx.width - yw - 2 * xLabels.length) / xLabels.length;
    let cellH = d.cell_height ?? Math.round(Math.max(16, Math.min(40, cellW * 0.75)));
    if (ctx.height) {
      const avail = ctx.height - headerHeight(d) - 24 - 40;
      cellH = Math.max(8, Math.floor(avail / yLabels.length) - 2);
    }
    const showValues = d.show_values ?? (cellW >= 30 && cellH >= 20);
    // Skip x labels that would collide.
    const every = Math.max(1, Math.ceil((Math.max(...xLabels.map((l) => textWidth(l, 11))) + 6) / (cellW + 2)));

    const rows = d.values.map(
      (row, ri) => html`<div class="hm-yl" style="${style({ height: cellH, 'line-height': `${cellH}px` })}">${yLabels[ri]}</div>${row.map((v) => {
        if (v == null) return html`<div class="hm-c hm-nil" style="${style({ height: cellH })}">${showValues ? '–' : ''}</div>`;
        const bg = colorOf(v);
        return html`<div class="hm-c" style="${style({ height: cellH, background: bg, color: inkOn(bg) })}">${showValues ? fmt(v) : ''}</div>`;
      })}`,
    );
    const xRow = html`<div></div>${xLabels.map((l, i) => html`<div class="hm-xl">${i % every === 0 ? l : ''}</div>`)}`;
    const gradient = `linear-gradient(90deg, ${ramp.join(', ')})`;
    return html`${header(d)}
    <div class="hm" style="${`grid-template-columns:${yw}px repeat(${xLabels.length}, minmax(0, 1fr))`}">${rows}${xRow}</div>
    <div class="hm-scale"><span>${fmt(lo)}</span><span class="hm-bar" style="${style({ background: gradient })}"></span><span>${fmt(hi)}</span>${
      diverging ? html`<span>· midpoint ${fmt(mid)}</span>` : null
    }</div>`;
  },
});
