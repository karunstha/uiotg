import { z } from 'zod';
import { titleFields } from '../../core/format.ts';
import { html, style } from '../../core/html.ts';
import { defineTemplate } from '../../core/types.ts';
import { header } from '../../core/ui.ts';

const GAP = 16;

/** A dashboard never has more columns than its blocks can fill. */
function effectiveColumns(d: { columns: number; blocks: Array<{ span: number }> }): number {
  return Math.max(1, Math.min(d.columns, d.blocks.reduce((n, b) => n + b.span, 0)));
}

export const dashboard = defineTemplate({
  id: 'dashboard',
  title: 'Dashboard',
  category: 'layout',
  description:
    'Composes other templates into one image: a grid of cards, each rendering any non-layout template with its own data. Blocks can span columns. Use for reports, status pages and multi-chart summaries.',
  schema: z.object({
    ...titleFields,
    updated: z.string().max(60).optional().describe('Shown top-right, e.g. "Updated 5 min ago"'),
    columns: z.number().int().min(1).max(4).default(2),
    blocks: z
      .array(
        z.object({
          template: z.string().describe('Any non-layout template id, e.g. "stats", "line_chart", "table"'),
          data: z.record(z.string(), z.unknown()).describe('Data for that template'),
          span: z.number().int().min(1).max(4).default(1).describe('Columns this block spans'),
          height: z.number().int().min(80).max(2000).optional().describe('Fixed card height in px'),
        }),
      )
      .min(1)
      .max(16),
    footer: z.string().max(300).optional(),
  }),
  example: {
    title: 'Weekly business review',
    subtitle: 'Week of October 6, 2026',
    updated: 'Updated today 08:00',
    columns: 2,
    blocks: [
      {
        template: 'stats',
        span: 2,
        data: {
          items: [
            { label: 'Revenue', value: 1_284_000, format: 'currency_compact', delta: 6.4, delta_label: 'WoW' },
            { label: 'New customers', value: 342, delta: 11.2, delta_label: 'WoW' },
            { label: 'Net retention', value: 1.12, format: 'percent', delta: '+2 pts', delta_label: 'QoQ' },
            { label: 'Open incidents', value: 1, delta: -2, delta_format: 'integer', good_when: 'down', delta_label: 'WoW' },
          ],
        },
      },
      {
        template: 'line_chart',
        data: {
          title: 'Daily revenue',
          x: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
          series: [
            { name: 'This week', values: [182, 204, 198, 221, 236, 120, 123] },
            { name: 'Last week', values: [171, 188, 190, 201, 214, 118, 115] },
          ],
          format: { prefix: '$', suffix: 'K' },
          height: 220,
        },
      },
      {
        template: 'bar_chart',
        data: {
          title: 'Signups by channel',
          categories: ['Organic', 'Paid search', 'Referral', 'Social', 'Partners'],
          series: [{ name: 'Signups', values: [148, 96, 51, 32, 15] }],
          height: 220,
        },
      },
      {
        template: 'progress',
        data: {
          title: 'Quarter goals',
          items: [
            { label: 'ARR target', value: 72 },
            { label: 'Enterprise logos', value: 9, max: 12, format: 'integer' },
            { label: 'Infra cost reduction', value: 41, status: 'warning', caption: 'Behind plan' },
          ],
        },
      },
      {
        template: 'list',
        data: {
          title: 'Highlights',
          style: 'check',
          items: [
            { text: 'Shipped SSO for all Business plans', status: 'done' },
            { text: 'EU data residency in beta', status: 'in_progress' },
            { text: 'Billing migration blocked on vendor API', status: 'blocked' },
          ],
        },
      },
    ],
  },
  width: (d) => {
    const cols = effectiveColumns(d);
    return cols >= 3 ? 1320 : cols === 1 ? 760 : 1120;
  },
  padding: 28,
  background: 'plane',
  css: /* css */ `
.db-grid{display:grid;gap:${GAP}px;align-items:stretch}
.db-card{background:var(--surface);border:1px solid var(--border);border-radius:14px;overflow:hidden;min-width:0}
.db-card > .block{height:100%}
.db-card:has(> .block.bare){background:none;border:0;border-radius:0;overflow:visible}
.db-card .hdr{margin-bottom:14px}
.db-card .hdr-title{font-size:16px}
.db-card .hdr-sub{font-size:13px}
.db-footer{margin-top:16px;font-size:12px;color:var(--muted)}
`,
  async render(d, ctx) {
    const cols = effectiveColumns(d);
    const colWidth = (ctx.width - GAP * (cols - 1)) / cols;
    const blocks = await Promise.all(
      d.blocks.map(async (b, i) => {
        const span = Math.min(b.span, cols);
        // Cards have a 1px border inside their box.
        const width = Math.floor(colWidth * span + GAP * (span - 1)) - 2;
        const body = await ctx.renderBlock(b.template, b.data, { width, height: b.height ? b.height - 2 : undefined }, `blocks[${i}].data`);
        return html`<section class="db-card" style="${style({ 'grid-column': `span ${span}`, height: b.height })}">${body}</section>`;
      }),
    );
    return html`${header(d, d.updated ? html`${d.updated}` : null)}
      <div class="db-grid" style="${`grid-template-columns:repeat(${cols}, minmax(0, 1fr))`}">${blocks}</div>
      ${d.footer ? html`<div class="db-footer">${d.footer}</div>` : null}`;
  },
});
