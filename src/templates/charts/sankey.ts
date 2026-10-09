import { z } from 'zod';
import { renderChart } from '../../core/echarts.ts';
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

    const svg = renderChart(
      {
        series: [
          {
            type: 'sankey',
            left: Math.max(...leftLabels.map((t) => textWidth(t, 12))) + 12,
            right: Math.max(...rightLabels.map((t) => textWidth(t, 12))) + 12,
            top: 6,
            bottom: 6,
            nodeWidth: 10,
            nodeGap: 14,
            nodeAlign: 'justify',
            layoutIterations: 64,
            draggable: false,
            emphasis: { disabled: true },
            label: { color: theme.text, fontSize: 12, formatter: (p: { name: string }) => labelText(p.name) },
            lineStyle: { color: 'source', opacity: theme.mode === 'dark' ? 0.36 : 0.26, curveness: 0.5 },
            itemStyle: { borderWidth: 0, borderRadius: 2 },
            data: names.map((n, i) => ({
              name: n,
              itemStyle: { color: seriesColor(theme, i) },
              // First-column labels sit to the left of their node, the rest to the right.
              label: { position: depth.get(n) === 0 ? 'left' : 'right' },
            })),
            links: d.links,
          },
        ],
      },
      size,
      theme,
    );
    return chartLayout(d, null, svg);
  },
});
