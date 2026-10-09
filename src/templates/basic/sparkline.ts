import { z } from 'zod';
import { colorSchema, display, formatSchema, makeFormatter } from '../../core/format.ts';
import { html } from '../../core/html.ts';
import { defineTemplate } from '../../core/types.ts';
import { delta, sparkline as drawSparkline, textDelta } from '../../core/ui.ts';

export const sparkline = defineTemplate({
  id: 'sparkline',
  title: 'Sparkline',
  category: 'basic',
  description:
    'A tiny trend line with an optional label, current value and change. Use when the shape of a recent trend matters more than exact values, e.g. "price over the last 30 days".',
  schema: z.object({
    values: z.array(z.number()).min(2).max(1000).describe('Oldest first'),
    label: z.string().max(60).optional(),
    value: z.union([z.number(), z.string().max(30)]).optional().describe('Headline value; defaults to the last point'),
    format: formatSchema.optional(),
    delta: z.union([z.number(), z.string().max(20)]).optional().describe('Numbers are percent changes (5.2 → +5.2%)'),
    good_when: z.enum(['up', 'down']).default('up'),
    color: colorSchema.optional(),
    area: z.boolean().default(true),
    height: z.number().int().min(24).max(240).default(56),
  }),
  example: {
    label: 'BTC · 30 days',
    values: [61.2, 60.8, 62.5, 63.1, 62.4, 64.9, 66.3, 65.1, 64.2, 66.8, 68.4, 67.9, 69.2, 70.5, 69.8, 71.6, 70.9, 72.4, 74.1, 73.2, 72.6, 74.8, 76.3, 75.1, 77.4, 78.2, 77.6, 79.4, 80.1, 81.3],
    format: { prefix: '$', suffix: 'K', decimals: 1 },
    delta: 32.8,
  },
  width: 360,
  padding: 20,
  css: /* css */ `
.sp-top{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin-bottom:10px}
.sp-label{font-size:13px;font-weight:500;color:var(--text-2)}
.sp-value{font-size:24px;font-weight:650;letter-spacing:-0.02em;color:var(--text);line-height:1.2}
.sp-right{text-align:right}
`,
  render(d, ctx) {
    const fmt = makeFormatter(d.format);
    const value = d.value ?? d.values[d.values.length - 1]!;
    let change = null;
    if (typeof d.delta === 'number') change = delta(d.delta, makeFormatter({ suffix: '%', decimals: Math.abs(d.delta) < 10 ? 1 : 0 }), d.good_when);
    else if (typeof d.delta === 'string') change = textDelta(d.delta, d.good_when);
    const showTop = d.label || d.value != null || d.format || change;
    return html`${showTop
      ? html`<div class="sp-top">
          <div>${d.label ? html`<div class="sp-label">${d.label}</div>` : null}<div class="sp-value">${display(value, fmt)}</div></div>
          ${change ? html`<div class="sp-right">${change}</div>` : null}
        </div>`
      : null}
    ${drawSparkline(d.values, { width: Math.floor(ctx.width), height: d.height, theme: ctx.theme, color: d.color, emphasis: true, area: d.area })}`;
  },
});
