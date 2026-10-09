import { z } from 'zod';
import { display, formatSchema, iconSchema, makeFormatter, titleFields } from '../../core/format.ts';
import { html, style } from '../../core/html.ts';
import { icon } from '../../core/icons.ts';
import { defineTemplate } from '../../core/types.ts';
import { header } from '../../core/ui.ts';

const value = z.union([z.string().max(200), z.number(), z.boolean(), z.null()]);

export const keyValue = defineTemplate({
  id: 'key_value',
  title: 'Key–value list',
  category: 'basic',
  description:
    'Label/value rows with an optional total, like a receipt, order summary, invoice, spec sheet or account details. Numbers are formatted and right-aligned.',
  schema: z.object({
    ...titleFields,
    items: z
      .array(
        z.object({
          label: z.string().min(1).max(80),
          value,
          format: formatSchema.optional(),
          icon: iconSchema.optional(),
          emphasis: z.boolean().optional().describe('Bold this row'),
          muted: z.boolean().optional().describe('De-emphasize this row (e.g. a discount note)'),
        }),
      )
      .min(1)
      .max(40),
    total: z.object({ label: z.string().max(80), value, format: formatSchema.optional() }).optional(),
    columns: z.number().int().min(1).max(2).default(1).describe('2 lays rows out in two columns (spec sheets)'),
  }),
  example: {
    title: 'Order #10482',
    subtitle: 'Placed Oct 9, 2026 · Paid with Visa •••• 4242',
    items: [
      { label: 'Wireless headphones', value: 249, format: 'currency' },
      { label: 'USB-C cable (2 m)', value: 19, format: 'currency' },
      { label: 'Shipping', value: 'Free' },
      { label: 'Discount (FALL10)', value: -26.8, format: 'currency', muted: true },
      { label: 'Tax', value: 19.33, format: 'currency' },
    ],
    total: { label: 'Total', value: 260.53, format: 'currency' },
  },
  width: (d) => (d.columns === 2 ? 760 : 460),
  css: /* css */ `
.kv-grid{display:grid;column-gap:32px}
.kv-row{display:flex;align-items:baseline;justify-content:space-between;gap:16px;padding:10px 0;border-bottom:1px solid var(--grid);font-size:14px}
.kv-k{display:flex;align-items:center;gap:7px;color:var(--text-2);min-width:0}
.kv-k .icon{color:var(--muted)}
.kv-v{color:var(--text);text-align:right;font-weight:500}
.kv-v.kv-n{font-variant-numeric:tabular-nums;white-space:nowrap}
.kv-row.em .kv-k,.kv-row.em .kv-v{color:var(--text);font-weight:650}
.kv-row.mu .kv-k,.kv-row.mu .kv-v{color:var(--muted)}
.kv-total{display:flex;justify-content:space-between;align-items:baseline;padding-top:14px;margin-top:-1px;border-top:1px solid var(--axis);
  font-size:17px;font-weight:700;color:var(--text)}
.kv-total .kv-v{font-weight:700;font-variant-numeric:tabular-nums}
.kv-yes{color:var(--good)}.kv-no{color:var(--muted)}
`,
  render(d) {
    const cell = (v: z.infer<typeof value>, fmt: ReturnType<typeof makeFormatter>) => {
      if (v === true) return html`<span class="kv-yes">${icon('check', { size: 16, strokeWidth: 2.5 })}</span>`;
      if (v === false) return html`<span class="kv-no">${icon('minus', { size: 16 })}</span>`;
      return display(v, fmt);
    };
    return html`${header(d)}
    <div class="kv-grid" style="${style({ 'grid-template-columns': `repeat(${d.columns}, minmax(0, 1fr))` })}">${d.items.map(
      (it) => html`<div class="${`kv-row${it.emphasis ? ' em' : ''}${it.muted ? ' mu' : ''}`}">
        <span class="kv-k">${icon(it.icon, { size: 15 })}${it.label}</span>
        <span class="${`kv-v${typeof it.value === 'number' ? ' kv-n' : ''}`}">${cell(it.value, makeFormatter(it.format))}</span>
      </div>`,
    )}</div>
    ${d.total
      ? html`<div class="kv-total"><span>${d.total.label}</span><span class="kv-v">${cell(d.total.value, makeFormatter(d.total.format))}</span></div>`
      : null}`;
  },
});
