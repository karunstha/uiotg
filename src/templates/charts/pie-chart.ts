import { z } from 'zod';
import { renderChart } from '../../core/echarts.ts';
import { colorSchema, formatSchema, makeFormatter, titleFields } from '../../core/format.ts';
import { html, style } from '../../core/html.ts';
import { seriesColor } from '../../core/theme.ts';
import { defineTemplate } from '../../core/types.ts';
import { header, headerHeight } from '../../core/ui.ts';

export const pieChart = defineTemplate({
  id: 'pie_chart',
  title: 'Donut / pie chart',
  category: 'chart',
  description:
    'Part-to-whole at a glance with a donut (or pie) and a legend listing each value and share. Small slices beyond `max_slices` fold into "Other". Prefer a bar chart when values are close or there are many parts.',
  schema: z.object({
    ...titleFields,
    slices: z
      .array(z.object({ label: z.string().min(1).max(80), value: z.number().nonnegative(), color: colorSchema.optional() }))
      .min(1)
      .max(100),
    donut: z.boolean().default(true),
    center_label: z.string().max(40).optional().describe('Caption inside the donut; default "Total"'),
    center_value: z.string().max(24).optional().describe('Big text inside the donut; default is the formatted total'),
    format: formatSchema.optional(),
    max_slices: z.number().int().min(2).max(8).default(6).describe('Slices beyond this fold into "Other"'),
    sort: z.boolean().default(true).describe('Order slices largest first'),
    show_share: z.boolean().optional().describe('Show each slice’s % of total; default on unless values are already percentages'),
  }),
  example: {
    title: 'Cloud spend by service',
    subtitle: 'September 2026',
    slices: [
      { label: 'Compute', value: 48_200 },
      { label: 'Storage', value: 21_400 },
      { label: 'Databases', value: 17_900 },
      { label: 'Networking', value: 9_300 },
      { label: 'Observability', value: 4_100 },
      { label: 'Other services', value: 2_600 },
    ],
    format: 'currency_compact',
    center_label: 'Total spend',
  },
  width: 680,
  richWhen: (d) => d.slices.length >= 4,
  css: /* css */ `
.pie{display:flex;align-items:center;gap:clamp(16px, 5%, 36px)}
.pie.narrow{flex-direction:column;align-items:stretch;gap:20px}
.pie-chart{position:relative;flex:none;margin:0 auto}
.pie-center{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;
  pointer-events:none}
.pie-cv{font-size:26px;font-weight:650;letter-spacing:-0.02em;color:var(--text)}
.pie-cl{font-size:12px;color:var(--text-2);margin-top:2px}
.pie-legend{flex:1;min-width:0;display:flex;flex-direction:column}
.pie-legend.no-share .pie-row{grid-template-columns:10px 1fr auto}
.pie-row{display:grid;grid-template-columns:10px 1fr auto 52px;align-items:center;column-gap:10px;padding:9px 0;font-size:14px}
.pie-row + .pie-row{border-top:1px solid var(--grid)}
.pie-name{color:var(--text);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pie-note{margin-top:12px;font-size:13px;color:var(--text-2)}
.pie-note b{color:var(--text);font-weight:620}
.pie-val{color:var(--text);font-weight:550;font-variant-numeric:tabular-nums;text-align:right}
.pie-pct{color:var(--text-2);font-variant-numeric:tabular-nums;text-align:right}
`,
  render(d, ctx) {
    const { theme } = ctx;
    const fmt = makeFormatter(d.format);
    let slices = d.slices.map((s, i) => ({ ...s, index: i }));
    // Largest first, but a slice the data calls "Other" always goes last.
    const isOther = (l: string) => /^other\b/i.test(l.trim());
    if (d.sort) slices = [...slices].sort((a, b) => Number(isOther(a.label)) - Number(isOther(b.label)) || b.value - a.value);
    let colored = slices.map((s, i) => ({ label: s.label, value: s.value, color: isOther(s.label) ? (s.color ?? theme.other) : seriesColor(theme, i, s.color) }));
    if (colored.length > d.max_slices) {
      const keep = colored.slice(0, d.max_slices - 1);
      const rest = colored.slice(d.max_slices - 1);
      colored = [...keep, { label: `Other (${rest.length})`, value: rest.reduce((s, r) => s + r.value, 0), color: theme.other }];
    }
    const total = colored.reduce((s, c) => s + c.value, 0);
    // Side by side down to ~340px; below that the legend stacks under the donut.
    const narrow = ctx.width < 340;
    let size = narrow ? Math.min(ctx.width, 240) : Math.round(Math.min(300, Math.max(120, ctx.width * 0.4)));
    if (ctx.height) size = Math.max(90, Math.min(size, ctx.height - headerHeight(d) - (narrow ? colored.length * 40 + 20 : 0)));

    const svg = renderChart(
      {
        series: [
          {
            type: 'pie',
            radius: d.donut ? ['64%', '96%'] : [0, '96%'],
            center: ['50%', '50%'],
            startAngle: 90,
            clockwise: true,
            label: { show: false },
            labelLine: { show: false },
            // 2px surface gap between segments.
            itemStyle: { borderColor: theme.surface, borderWidth: 2, borderRadius: d.donut ? 3 : 0 },
            data: colored.map((c) => ({ name: c.label, value: c.value, itemStyle: { color: c.color } })),
          },
        ],
      },
      { width: size, height: size },
      theme,
    );

    const percentFormat =
      d.format === 'percent' || (typeof d.format === 'object' && (d.format.style === 'percent' || d.format.suffix?.trim() === '%'));
    const minimal = ctx.detail === 'minimal';
    const showShare = d.show_share ?? !percentFormat;
    // Minimal keeps one number per slice: the share (or the value when values already are shares).
    const showValue = !(minimal && showShare);
    let insight = null;
    if (ctx.detail === 'rich' && total > 0 && colored.length >= 4) {
      const topN = colored[0]!.value / total >= 0.5 ? 1 : 2;
      const share = colored.slice(0, topN).reduce((s, c) => s + c.value, 0) / total;
      insight = html`<div class="pie-note">${topN === 1 ? colored[0]!.label : `${colored[0]!.label} and ${colored[1]!.label}`} ${topN === 1 ? 'makes' : 'make'} up <b>${Math.round(share * 100)}%</b> of the total.</div>`;
    }
    const pct = (v: number) => (total > 0 ? `${((v / total) * 100).toFixed(v / total < 0.1 ? 1 : 0)}%` : '–');
    return html`${header(d)}<div class="${`pie${narrow ? ' narrow' : ''}`}">
      <div class="pie-chart" style="${style({ width: size, height: size })}">
        ${svg}
        ${d.donut
          ? html`<div class="pie-center"><div class="pie-cv">${d.center_value ?? fmt(total)}</div><div class="pie-cl">${d.center_label ?? 'Total'}</div></div>`
          : null}
      </div>
      <div class="${`pie-legend${showShare && showValue ? '' : ' no-share'}`}">${colored.map(
        (c) => html`<div class="pie-row">
          <span class="key" style="${style({ background: c.color })}"></span>
          <span class="pie-name">${c.label}</span>
          ${showValue ? html`<span class="pie-val">${fmt(c.value)}</span>` : null}
          ${showShare ? html`<span class="pie-pct">${pct(c.value)}</span>` : null}
        </div>`,
      )}${insight}</div>
    </div>`;
  },
});
