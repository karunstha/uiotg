import { z } from 'zod';
import { renderChart } from '../../core/echarts.ts';
import { titleFields } from '../../core/format.ts';
import { defineTemplate } from '../../core/types.ts';
import { chartLayout, plotHeightSchema, plotSize } from './common.ts';

export const echartsTemplate = defineTemplate({
  id: 'echarts',
  title: 'Custom ECharts',
  category: 'chart',
  description:
    'Escape hatch for anything the other chart templates don’t cover (boxplot, polar, parallel, graph, sunburst, themeRiver, calendar, multi-grid…): pass a complete Apache ECharts option object. The uiotg theme (palette, fonts, axes) applies automatically; animation and tooltips are off and functions aren’t supported.',
  schema: z.object({
    ...titleFields,
    option: z.record(z.string(), z.unknown()).describe('An Apache ECharts option object (JSON only)'),
    height: plotHeightSchema,
  }),
  example: {
    title: 'Response time distribution',
    subtitle: 'Per endpoint, ms',
    option: {
      grid: { left: 0, right: 12, top: 8, bottom: 0, containLabel: true },
      xAxis: { type: 'category', data: ['/search', '/checkout', '/profile', '/feed'] },
      yAxis: { type: 'value' },
      series: [
        {
          type: 'boxplot',
          itemStyle: { borderWidth: 1.5 },
          data: [
            [40, 82, 110, 160, 260],
            [120, 180, 220, 290, 410],
            [20, 35, 48, 66, 98],
            [60, 95, 130, 175, 280],
          ],
        },
      ],
    },
  },
  width: 800,
  render(d, ctx) {
    const size = plotSize(ctx, d, [], 0.52);
    return chartLayout(d, null, renderChart(d.option, size, ctx.theme));
  },
});
