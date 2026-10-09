import { z } from 'zod';
import { renderChart } from '../../core/echarts.ts';
import { colorSchema, formatSchema, makeFormatter, titleFields } from '../../core/format.ts';
import { inkOn, seriesColor } from '../../core/theme.ts';
import { defineTemplate } from '../../core/types.ts';
import { chartLayout, plotHeightSchema, plotSize } from './common.ts';

const leaf = z.object({ name: z.string().min(1).max(60), value: z.number().nonnegative() });
const group = z.object({
  name: z.string().min(1).max(60),
  children: z.array(leaf).min(1).max(100),
  color: colorSchema.optional(),
});

export const treemap = defineTemplate({
  id: 'treemap',
  title: 'Treemap',
  category: 'chart',
  description:
    'Hierarchical part-to-whole as nested rectangles sized by value: top-level groups (each a color) containing leaves. Use for budgets, disk usage, market share by segment, portfolio weights.',
  schema: z.object({
    ...titleFields,
    items: z
      .array(z.union([group, leaf.extend({ color: colorSchema.optional() })]))
      .min(1)
      .max(60)
      .describe('Top-level items: either leaves {name, value} or groups {name, children: [{name, value}]}'),
    format: formatSchema.optional(),
    height: plotHeightSchema,
  }),
  example: {
    title: 'Engineering budget',
    subtitle: 'FY2027 plan, USD',
    format: 'currency_compact',
    items: [
      { name: 'Infrastructure', children: [{ name: 'Compute', value: 4_200_000 }, { name: 'Storage', value: 1_300_000 }, { name: 'Network', value: 700_000 }] },
      { name: 'Headcount', children: [{ name: 'Platform', value: 3_600_000 }, { name: 'Product', value: 5_100_000 }, { name: 'Data', value: 1_900_000 }] },
      { name: 'Tooling', children: [{ name: 'CI/CD', value: 600_000 }, { name: 'Observability', value: 800_000 }, { name: 'Security', value: 500_000 }] },
      { name: 'Training', value: 400_000 },
    ],
  },
  width: 800,
  render(d, ctx) {
    const { theme } = ctx;
    const fmt = makeFormatter(d.format);
    const size = plotSize(ctx, d, [], 0.56);
    const data = d.items.map((item, i) => {
      const color = seriesColor(theme, i, item.color);
      const ink = inkOn(color);
      if ('children' in item) {
        // Groups are painted in the surface color: their header band and the
        // gaps between their (colored) leaves read as surface.
        return {
          name: item.name,
          itemStyle: { color: theme.surface, borderColor: theme.surface },
          upperLabel: { color: theme.text },
          children: item.children.map((c) => ({ name: c.name, value: c.value, itemStyle: { color }, label: { color: ink } })),
        };
      }
      return { name: item.name, value: item.value, itemStyle: { color }, label: { color: ink } };
    });
    const svg = renderChart(
      {
        series: [
          {
            type: 'treemap',
            left: 0,
            top: 0,
            right: 0,
            bottom: 0,
            roam: false,
            nodeClick: false,
            breadcrumb: { show: false },
            squareRatio: 0.5 * (1 + Math.sqrt(5)),
            label: {
              show: true,
              position: 'insideTopLeft',
              padding: [8, 10],
              fontSize: 12,
              lineHeight: 16,
              overflow: 'truncate',
              formatter: (p: { name: string; value: number }) => `{name|${p.name}}\n${fmt(p.value)}`,
              rich: { name: { fontSize: 12, fontWeight: 600, lineHeight: 18 } },
            },
            // levels[0] is ECharts' virtual root; only groups (level 1) get a header band.
            levels: [
              { itemStyle: { borderWidth: 0, gapWidth: 2, borderColor: theme.surface }, upperLabel: { show: false } },
              {
                itemStyle: { borderWidth: 0, gapWidth: 2 },
                upperLabel: {
                  show: true,
                  height: 26,
                  fontSize: 12,
                  fontWeight: 600,
                  padding: [0, 2],
                  formatter: (p: { name: string; value: number }) => `${p.name}  ·  ${fmt(p.value)}`,
                },
              },
              { itemStyle: { borderWidth: 0, gapWidth: 2 } },
            ],
            data,
          },
        ],
      },
      size,
      theme,
    );
    return chartLayout(d, null, svg);
  },
});
