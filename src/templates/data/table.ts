import { z } from 'zod';
import { display, formatSchema, makeFormatter, statusSchema, titleFields, type Formatter } from '../../core/format.ts';
import { html, style, type Html } from '../../core/html.ts';
import { icon } from '../../core/icons.ts';
import { defineTemplate } from '../../core/types.ts';
import { header, statusBadge } from '../../core/ui.ts';

const cell = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const row = z.union([z.record(z.string(), cell), z.array(cell)]);

const columnSchema = z.union([
  z.string(),
  z.object({
    key: z.string().describe('Property name in object rows (or the header text for array rows)'),
    label: z.string().optional().describe('Header text; defaults to the key'),
    align: z.enum(['left', 'center', 'right']).optional().describe('Defaults to right for numeric columns'),
    format: formatSchema.optional(),
    type: z
      .enum(['text', 'number', 'tag', 'status'])
      .optional()
      .describe('"tag" renders pills; "status" expects good/warning/serious/critical and renders icon+label'),
    bar: z.boolean().optional().describe('Draw an inline bar proportional to the column maximum'),
    width: z.number().int().min(30).max(800).optional().describe('Column width in px'),
  }),
]);

type Cell = z.infer<typeof cell>;
type Row = z.infer<typeof row>;

interface Column {
  key: string;
  label: string;
  index: number;
  align: 'left' | 'center' | 'right';
  type: 'text' | 'number' | 'tag' | 'status';
  fmt: Formatter;
  bar: boolean;
  max: number;
  width?: number;
}

function valueAt(r: Row, col: { key: string; index: number }): Cell | undefined {
  return Array.isArray(r) ? r[col.index] : r[col.key];
}

export const table = defineTemplate({
  id: 'table',
  title: 'Table',
  category: 'data',
  description:
    'A clean data table with number formatting, right-aligned numeric columns, optional inline bars, tag/status columns, highlighted rows and a totals footer. Rows can be objects or arrays.',
  schema: z.object({
    ...titleFields,
    columns: z
      .array(columnSchema)
      .max(20)
      .optional()
      .describe('Column order and options; strings are shorthand for {key}. Omit to infer from the first row.'),
    rows: z.array(row).max(500),
    footer: row.optional().describe('Totals row shown under a rule'),
    highlight_rows: z.array(z.number().int().min(0)).optional().describe('0-based indexes of rows to emphasize'),
    zebra: z.boolean().default(false).describe('Alternate row shading'),
    dense: z.boolean().default(false).describe('Tighter row height'),
    caption: z.string().max(400).optional().describe('Muted note under the table, e.g. a source'),
  }),
  example: {
    title: 'Top regions by revenue',
    subtitle: 'Q3 2026, USD',
    columns: [
      { key: 'region', label: 'Region' },
      { key: 'revenue', label: 'Revenue', format: 'currency_compact', bar: true },
      { key: 'growth', label: 'YoY', format: 'percent' },
      { key: 'customers', label: 'Customers', format: 'number' },
      { key: 'health', label: 'Health', type: 'status' },
    ],
    rows: [
      { region: 'North America', revenue: 4_210_000, growth: 0.124, customers: 1840, health: 'good' },
      { region: 'Europe', revenue: 3_180_000, growth: 0.087, customers: 1522, health: 'good' },
      { region: 'Asia Pacific', revenue: 2_460_000, growth: 0.211, customers: 1203, health: 'warning' },
      { region: 'Latin America', revenue: 910_000, growth: -0.032, customers: 488, health: 'serious' },
      { region: 'Middle East & Africa', revenue: 540_000, growth: 0.054, customers: 251, health: 'good' },
    ],
    footer: { region: 'Total', revenue: 11_300_000, growth: 0.109, customers: 5304 },
    caption: 'Source: billing warehouse, refreshed daily.',
  },
  width: (d) => {
    const n = d.columns?.length ?? (Array.isArray(d.rows[0]) ? d.rows[0].length : Object.keys(d.rows[0] ?? {}).length);
    return Math.min(1200, Math.max(560, n * 150 + 64));
  },
  css: /* css */ `
.tb{width:100%;border-collapse:collapse;font-size:14px;line-height:20px}
.tb th{font-size:12px;font-weight:600;color:var(--text-2);text-align:left;padding:0 12px 10px;border-bottom:1px solid var(--axis);
  white-space:nowrap}
.tb td{padding:10px 12px;border-bottom:1px solid var(--grid);color:var(--text);vertical-align:middle}
.tb.dense td{padding:6px 12px}
.tb th:first-child,.tb td:first-child{padding-left:0}
.tb th:last-child,.tb td:last-child{padding-right:0}
.tb.zebra tbody tr:nth-child(even) td{background:color-mix(in srgb, var(--subtle) 70%, transparent)}
.tb.zebra td:first-child{padding-left:8px}.tb.zebra th:first-child{padding-left:8px}
.tb tr.tb-hl td{background:color-mix(in srgb, var(--accent) 9%, transparent);font-weight:550}
.tb tr.tb-hl td:first-child{box-shadow:inset 3px 0 0 var(--accent);padding-left:12px}
.tb tfoot td{border-top:1px solid var(--axis);border-bottom:0;font-weight:600}
.tb .r{text-align:right}.tb .c{text-align:center}
.tb .n{font-variant-numeric:tabular-nums;white-space:nowrap}
.tb .nil{color:var(--muted)}
.tb .bool-t{color:var(--good)}.tb .bool-f{color:var(--muted)}
.tb-bar{display:flex;align-items:center;gap:10px;justify-content:flex-end}
/* Fixed-width track anchored to the cell's right edge, so every bar shares one baseline. */
.tb-bar-track{flex:none;width:110px;height:8px;display:flex;justify-content:flex-start}
.tb-bar-fill{height:8px;border-radius:0 4px 4px 0;background:var(--accent)}
.tb-caption{margin-top:12px;font-size:12px;color:var(--muted)}
`,
  render(d, ctx) {
    const first = d.rows[0];
    const specs = (d.columns ?? (Array.isArray(first) ? first.map((_, i) => `Column ${i + 1}`) : Object.keys(first ?? {}))).map((c) =>
      typeof c === 'string' ? { key: c } : c,
    );
    const cols: Column[] = specs.map((spec, index) => {
      const values = d.rows.map((r) => valueAt(r, { key: spec.key, index }));
      const present = values.filter((v) => v != null && v !== '');
      const numeric = present.length > 0 && present.every((v) => typeof v === 'number');
      const type = spec.type ?? (numeric ? 'number' : 'text');
      const nums = values.filter((v): v is number => typeof v === 'number');
      return {
        key: spec.key,
        label: spec.label ?? spec.key,
        index,
        type,
        align: spec.align ?? (type === 'number' ? 'right' : 'left'),
        fmt: makeFormatter(spec.format),
        bar: !!spec.bar && nums.length > 0,
        max: Math.max(0, ...nums),
        width: spec.width,
      };
    });
    const highlighted = new Set(d.highlight_rows ?? []);

    const renderCell = (col: Column, v: Cell | undefined, footer = false): Html => {
      const cls = [col.align === 'right' ? 'r' : col.align === 'center' ? 'c' : '', typeof v === 'number' ? 'n' : ''].join(' ');
      let content: Html | string;
      if (v == null || v === '') content = html`<span class="nil">–</span>`;
      else if (typeof v === 'boolean')
        content = html`<span class="${v ? 'bool-t' : 'bool-f'}">${icon(v ? 'check' : 'minus', { size: 16, strokeWidth: 2.5 })}</span>`;
      else if (col.type === 'status' && statusSchema.safeParse(v).success) content = statusBadge(v as z.infer<typeof statusSchema>);
      else if (col.type === 'tag') content = html`<span class="tag">${String(v)}</span>`;
      else content = display(v, col.fmt);
      if (col.bar && typeof v === 'number' && !footer) {
        const pct = col.max > 0 ? Math.max(0, (v / col.max) * 100) : 0;
        content = html`<div class="tb-bar"><span>${content}</span><span class="tb-bar-track"><span class="tb-bar-fill" style="${`width:${pct.toFixed(1)}%`}"></span></span></div>`;
      }
      return html`<td class="${cls}">${content}</td>`;
    };

    const minimal = ctx.detail === 'minimal';
    return html`${header(minimal ? { title: d.title } : d)}<table class="${`tb${d.zebra ? ' zebra' : ''}${d.dense || minimal ? ' dense' : ''}`}">
      <thead><tr>${cols.map(
        (c) => html`<th class="${c.align === 'right' ? 'r' : c.align === 'center' ? 'c' : ''}" style="${style({ width: c.width })}">${c.label}</th>`,
      )}</tr></thead>
      <tbody>${d.rows.map(
        (r, i) => html`<tr class="${highlighted.has(i) ? 'tb-hl' : ''}">${cols.map((c) => renderCell(c, valueAt(r, c)))}</tr>`,
      )}</tbody>
      ${d.footer ? html`<tfoot><tr>${cols.map((c) => renderCell(c, valueAt(d.footer!, c), true))}</tr></tfoot>` : null}
    </table>
    ${d.caption && !minimal ? html`<div class="tb-caption">${d.caption}</div>` : null}`;
  },
});
