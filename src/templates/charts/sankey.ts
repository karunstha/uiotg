import { z } from 'zod';
import { renderChart } from '../../core/echarts.ts';
import { html } from '../../core/html.ts';
import { wrapText } from '../../core/measure.ts';
import { formatSchema, makeFormatter, titleFields } from '../../core/format.ts';
import { seriesColor } from '../../core/theme.ts';
import { defineTemplate } from '../../core/types.ts';
import { chartLayout, plotHeightSchema, plotSize, textWidth } from './common.ts';

export const sankey = defineTemplate({
  id: 'sankey',
  title: 'Sankey / flow diagram',
  category: 'chart',
  description:
    'Flows between stages as weighted links (budgets, traffic sources → outcomes, energy, user journeys). Nodes are derived from the links; the graph must be acyclic.',
  schema: z.object({
    ...titleFields,
    links: z
      .array(z.object({ source: z.string().min(1).max(60), target: z.string().min(1).max(60), value: z.number().positive() }))
      .min(1)
      .max(300),
    format: formatSchema.optional(),
    height: plotHeightSchema,
  }),
  example: {
    title: 'Where signups come from',
    subtitle: 'September 2026, 12,400 visitors',
    links: [
      { source: 'Search', target: 'Landing page', value: 5200 },
      { source: 'Social', target: 'Landing page', value: 2900 },
      { source: 'Referral', target: 'Pricing page', value: 2100 },
      { source: 'Direct', target: 'Pricing page', value: 2200 },
      { source: 'Landing page', target: 'Pricing page', value: 3100 },
      { source: 'Landing page', target: 'Bounced', value: 5000 },
      { source: 'Pricing page', target: 'Signed up', value: 2600 },
      { source: 'Pricing page', target: 'Bounced', value: 4800 },
    ],
    format: 'number',
  },
  width: 860,
  css: /* css */ `
.sk-key{list-style:none;display:grid;grid-template-columns:repeat(auto-fill, minmax(220px, 1fr));gap:6px 18px;margin-top:12px;font-size:13px;color:var(--text-2)}
.sk-key li{display:flex;gap:8px;align-items:baseline;min-width:0}
.sk-key b{flex:none;width:20px;height:20px;border-radius:50%;background:var(--subtle);color:var(--text);font-size:11px;display:inline-flex;align-items:center;justify-content:center}
.sk-key .sk-v{white-space:nowrap;margin-left:auto;color:var(--text);font-weight:550;font-variant-numeric:tabular-nums}
`,
  render(d, ctx) {
    const { theme } = ctx;
    const fmt = makeFormatter(d.format);
    const names: string[] = [];
    for (const l of d.links) for (const n of [l.source, l.target]) if (!names.includes(n)) names.push(n);

    // Depth of each node (longest path from a source) to place labels on the outside.
    const depth = new Map<string, number>(names.map((n) => [n, 0]));
    for (let pass = 0; pass < names.length; pass++) {
      let changed = false;
      for (const l of d.links) {
        const next = depth.get(l.source)! + 1;
        if (next > depth.get(l.target)!) {
          depth.set(l.target, next);
          changed = true;
        }
      }
      if (!changed) break;
    }
    const maxDepth = Math.max(...depth.values());
    const flow = (n: string) =>
      Math.max(
        d.links.filter((l) => l.source === n).reduce((s, l) => s + l.value, 0),
        d.links.filter((l) => l.target === n).reduce((s, l) => s + l.value, 0),
      );
    const labelText = (n: string) => `${n}  ${fmt(flow(n))}`;
    const rightLabels = names.filter((n) => depth.get(n) === maxDepth).map(labelText);
    const leftLabels = names.filter((n) => depth.get(n) === 0).map(labelText);
    const size = plotSize(ctx, d, [], 0.5);
    // Side labels get up to 22% of the width each and wrap beyond it.
    const cap = Math.max(70, size.width * 0.22);
    let leftW = Math.min(cap, Math.max(...leftLabels.map((t) => textWidth(t, 12))) + 6);
    let rightW = Math.min(cap, Math.max(...rightLabels.map((t) => textWidth(t, 12))) + 6);
    const midW = (size.width - leftW - rightW) / Math.max(1, maxDepth) - 24;
    const widthFor = (n: string) => (depth.get(n) === 0 ? leftW : depth.get(n) === maxDepth ? rightW : midW);
    // When labels can't fit beside their nodes (too narrow, or more than three lines), nodes get
    // numbers and a key below lists every name and value.
    const numbered = (maxDepth >= 2 && midW < 70) || names.some((n) => wrapText(labelText(n), widthFor(n), 12).length > 3);
    if (numbered) leftW = rightW = 22;
    const index = (n: string) => String(names.indexOf(n) + 1);
    const text = (n: string) => (numbered ? index(n) : wrapText(labelText(n), widthFor(n), 12).join('\n'));
    const lines = (n: string) => text(n).split('\n').length;
    // Adjacent node centers are at least nodeGap apart, so a gap as tall as the tallest label block keeps labels apart.
    const maxLines = Math.max(...names.map(lines));
    const nodeGap = Math.max(14, maxLines * 16 + 4);
    const perColumn = new Map<number, number>();
    for (const n of names) perColumn.set(depth.get(n)!, (perColumn.get(depth.get(n)!) ?? 0) + 1);
    const crowded = Math.max(...perColumn.values());
    // Height follows the busiest column: small flows get small charts, crowded ones get room for labels.
    if (!ctx.height && !d.height) size.height = Math.max(Math.min(size.height, crowded * 70 + 50), crowded * nodeGap + crowded * 18 + 20);

    const svg = renderChart(
      {
        series: [
          {
            type: 'sankey',
            left: leftW + 18,
            right: rightW + 18,
            // Multi-line labels are centered on their node, so the outer nodes need room above and below.
            top: Math.max(6, (maxLines - 1) * 8 + 4),
            bottom: Math.max(6, (maxLines - 1) * 8 + 4),
            nodeWidth: 10,
            nodeGap,
            nodeAlign: 'justify',
            layoutIterations: 64,
            draggable: false,
            emphasis: { disabled: true },
            label: { color: theme.text, fontSize: 12, lineHeight: 16, fontWeight: numbered ? 700 : 400, formatter: (p: { name: string }) => text(p.name) },
            lineStyle: { color: 'source', opacity: theme.mode === 'dark' ? 0.36 : 0.26, curveness: 0.5 },
            itemStyle: { borderWidth: 0, borderRadius: 2 },
            data: names.map((n, i) => ({
              name: n,
              itemStyle: { color: seriesColor(theme, i) },
              // First-column labels sit to the left of their node, the rest to the right.
              label: {
                position: depth.get(n) === 0 ? 'left' : 'right',
              },
            })),
            links: d.links,
          },
        ],
      },
      size,
      theme,
    );
    const key = numbered
      ? html`<ol class="sk-key">${names.map((n, i) => html`<li><b>${i + 1}</b><span>${n}</span><span class="sk-v">${fmt(flow(n))}</span></li>`)}</ol>`
      : null;
    return chartLayout(d, null, svg, { below: key });
  },
});
