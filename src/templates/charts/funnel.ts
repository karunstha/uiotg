import { z } from 'zod';
import { formatSchema, makeFormatter, titleFields } from '../../core/format.ts';
import { html, style } from '../../core/html.ts';
import { defineTemplate } from '../../core/types.ts';
import { header } from '../../core/ui.ts';

export const funnel = defineTemplate({
  id: 'funnel',
  title: 'Funnel',
  category: 'chart',
  description:
    'Ordered stages that narrow (signup → activation → purchase), with each stage’s value, share of the first stage and step conversion.',
  schema: z.object({
    ...titleFields,
    stages: z.array(z.object({ label: z.string().min(1).max(60), value: z.number().nonnegative() })).min(2).max(12),
    format: formatSchema.optional(),
    show_conversion: z.boolean().default(true).describe('Show % of first stage and step-to-step conversion'),
  }),
  example: {
    title: 'Checkout funnel',
    subtitle: 'Last 7 days, all platforms',
    stages: [
      { label: 'Viewed product', value: 48_210 },
      { label: 'Added to cart', value: 12_904 },
      { label: 'Started checkout', value: 7_311 },
      { label: 'Entered payment', value: 5_120 },
      { label: 'Purchased', value: 4_388 },
    ],
  },
  width: 760,
  css: /* css */ `
.fn{display:grid;grid-template-columns:minmax(120px, 190px) 1fr auto;column-gap:16px;row-gap:6px;align-items:center}
.fn-label{font-size:14px;color:var(--text);line-height:18px}
.fn-step{font-size:12px;color:var(--muted);line-height:16px;font-variant-numeric:tabular-nums}
.fn-track{height:36px;display:flex;justify-content:center}
.fn-bar{height:36px;border-radius:calc(4px * var(--rk));min-width:3px}
.fn-val{text-align:right;font-variant-numeric:tabular-nums;min-width:96px}
.fn-num{font-size:14px;font-weight:600;color:var(--text)}
.fn-pct{font-size:12px;color:var(--text-2)}
`,
  render(d, ctx) {
    const { theme } = ctx;
    const fmt = makeFormatter(d.format);
    const first = d.stages[0]!.value || 1;
    const max = Math.max(...d.stages.map((s) => s.value)) || 1;
    const n = d.stages.length;
    // Ordinal ramp (ordered weak → strong for the mode): the first stage takes the strongest step.
    const ramp = theme.ordinal;
    const colorAt = (i: number) => ramp[Math.round(((ramp.length - 1) * (n - 1 - i)) / Math.max(1, n - 1))]!;
    const pct = (v: number) => `${(v * 100).toFixed(v < 0.1 ? 1 : 0)}%`;
    return html`${header(d)}<div class="fn">${d.stages.map((s, i) => {
      const prev = i > 0 ? d.stages[i - 1]!.value : null;
      const color = colorAt(i);
      const width = (s.value / max) * 100;
      return html`<div>
          <div class="fn-label">${s.label}</div>
          ${d.show_conversion && prev ? html`<div class="fn-step">${pct(s.value / prev)} of previous</div>` : null}
        </div>
        <div class="fn-track"><div class="fn-bar" style="${style({ width: `${width.toFixed(2)}%`, background: color })}"></div></div>
        <div class="fn-val"><div class="fn-num">${fmt(s.value)}</div>${
          d.show_conversion && i > 0 ? html`<div class="fn-pct">${pct(s.value / first)} of total</div>` : null
        }</div>`;
    })}</div>`;
  },
});
