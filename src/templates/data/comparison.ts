import { z } from 'zod';
import { titleFields } from '../../core/format.ts';
import { html, style } from '../../core/html.ts';
import { icon } from '../../core/icons.ts';
import { defineTemplate } from '../../core/types.ts';
import { header } from '../../core/ui.ts';

const value = z.union([z.string(), z.number(), z.boolean(), z.null()]);

export const comparison = defineTemplate({
  id: 'comparison',
  title: 'Comparison matrix',
  category: 'data',
  description:
    'Side-by-side comparison of 2–5 options (plans, products, approaches) against criteria. Booleans render as check / dash icons; one option can be highlighted as recommended.',
  schema: z
    .object({
      ...titleFields,
      options: z
        .array(
          z.object({
            name: z.string().min(1).max(60),
            description: z.string().max(160).optional(),
            price: z.string().max(40).optional().describe('Display price, e.g. "$12/mo"'),
            badge: z.string().max(30).optional().describe('Small label such as "Recommended"'),
            highlight: z.boolean().optional(),
          }),
        )
        .min(2)
        .max(5),
      criteria: z
        .array(
          z.object({
            label: z.string().min(1).max(100),
            values: z.array(value).describe('One value per option, in option order'),
            note: z.string().max(160).optional(),
          }),
        )
        .min(1)
        .max(40),
      footer: z.string().max(300).optional(),
    })
    .superRefine((d, ctx) => {
      d.criteria.forEach((c, i) => {
        if (c.values.length !== d.options.length)
          ctx.addIssue({
            code: 'custom',
            path: ['criteria', i, 'values'],
            message: `Expected ${d.options.length} values (one per option), got ${c.values.length}`,
          });
      });
    }),
  example: {
    title: 'Choosing a vector database',
    subtitle: 'For ~50M embeddings, managed hosting preferred',
    options: [
      { name: 'pgvector', description: 'Postgres extension', price: 'Self-hosted' },
      { name: 'Qdrant', description: 'Rust, open source', price: 'From $25/mo', badge: 'Recommended', highlight: true },
      { name: 'Pinecone', description: 'Fully managed', price: 'From $70/mo' },
    ],
    criteria: [
      { label: 'Managed hosting', values: [false, true, true] },
      { label: 'Hybrid search', values: [false, true, true] },
      { label: 'Filtering on metadata', values: [true, true, true] },
      { label: 'p95 query latency', values: ['48 ms', '12 ms', '19 ms'] },
      { label: 'Runs on our existing DB', values: [true, false, false] },
      { label: 'Open source', values: [true, true, false] },
    ],
    footer: 'Latency measured on a 10M-vector sample, top-k = 10.',
  },
  fit: 'content',
  minWidth: 420,
  width: (d) => Math.min(1200, 260 + d.options.length * 190 + 64),
  css: /* css */ `
.cm{display:grid;font-size:14px}
.cm-cell{padding:12px 14px;border-bottom:1px solid var(--grid);display:flex;align-items:center;justify-content:center;
  text-align:center;color:var(--text)}
.cm-cell.lbl{justify-content:flex-start;text-align:left;padding-left:0;flex-direction:column;align-items:flex-start;gap:2px}
.cm-note{font-size:12px;color:var(--muted)}
.cm-head{flex-direction:column;gap:4px;padding:16px 14px 14px;border-bottom:1px solid var(--axis);align-items:center;
  justify-content:flex-end}
.cm-head.lbl{border-bottom:1px solid var(--axis)}
.cm-name{font-size:16px;font-weight:650;letter-spacing:-0.01em}
.cm-desc{font-size:12.5px;color:var(--text-2)}
.cm-price{font-size:13px;font-weight:600;color:var(--text);margin-top:2px}
.cm-badge{font-size:11px;font-weight:650;letter-spacing:.04em;text-transform:uppercase;color:var(--on-accent);background:var(--accent);
  padding:3px 9px;border-radius:var(--pill);margin-bottom:4px}
.cm-hl{background:color-mix(in srgb, var(--accent) 7%, transparent)}
.cm-head.cm-hl{border-top:3px solid var(--accent);border-radius:calc(12px * var(--rk)) calc(12px * var(--rk)) 0 0}
.cm-last.cm-hl{border-radius:0 0 calc(12px * var(--rk)) calc(12px * var(--rk));border-bottom-color:transparent}
.cm-yes{color:var(--good)}.cm-no{color:var(--muted)}.cm-nil{color:var(--muted)}
.cm-footer{margin-top:14px;font-size:12px;color:var(--muted)}
`,
  render(d) {
    const n = d.options.length;
    const hl = d.options.map((o) => !!o.highlight);
    const cell = (v: z.infer<typeof value>) => {
      if (v === true) return html`<span class="cm-yes">${icon('check', { size: 18, strokeWidth: 2.5 })}</span>`;
      if (v === false) return html`<span class="cm-no">${icon('minus', { size: 18, strokeWidth: 2 })}</span>`;
      if (v == null || v === '') return html`<span class="cm-nil">–</span>`;
      return String(v);
    };
    const last = d.criteria.length - 1;
    return html`${header(d)}<div class="cm" style="${style({ 'grid-template-columns': `minmax(160px, 1.3fr) repeat(${n}, minmax(0, 1fr))` })}">
      <div class="cm-cell cm-head lbl"></div>
      ${d.options.map(
        (o, i) => html`<div class="${`cm-cell cm-head${hl[i] ? ' cm-hl' : ''}`}">
          ${o.badge ? html`<span class="cm-badge">${o.badge}</span>` : null}
          <span class="cm-name">${o.name}</span>
          ${o.description ? html`<span class="cm-desc">${o.description}</span>` : null}
          ${o.price ? html`<span class="cm-price">${o.price}</span>` : null}
        </div>`,
      )}
      ${d.criteria.map(
        (c, r) => html`<div class="cm-cell lbl"><span>${c.label}</span>${c.note ? html`<span class="cm-note">${c.note}</span>` : null}</div>
        ${c.values.map((v, i) => html`<div class="${`cm-cell${hl[i] ? ' cm-hl' : ''}${r === last ? ' cm-last' : ''}`}">${cell(v)}</div>`)}`,
      )}
    </div>
    ${d.footer ? html`<div class="cm-footer">${d.footer}</div>` : null}`;
  },
});
