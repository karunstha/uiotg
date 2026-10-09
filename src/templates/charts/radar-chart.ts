import { z } from 'zod';
import { renderChart } from '../../core/echarts.ts';
import { colorSchema, formatSchema, makeFormatter, titleFields } from '../../core/format.ts';
import { seriesColor } from '../../core/theme.ts';
import { defineTemplate } from '../../core/types.ts';
import { chartLayout, plotHeightSchema, plotSize, seriesLegend } from './common.ts';

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const mag = 10 ** Math.floor(Math.log10(v));
  const n = v / mag;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag;
}

export const radarChart = defineTemplate({
  id: 'radar_chart',
  title: 'Radar chart',
  category: 'chart',
  description:
    'Compare 1–4 profiles across 3–12 dimensions on a shared scale (skills, product attributes, scores). Each axis can have its own max.',
  schema: z
    .object({
      ...titleFields,
      axes: z
        .array(z.union([z.string(), z.object({ name: z.string().min(1).max(40), max: z.number().positive().optional() })]))
        .min(3)
        .max(12),
      series: z
        .array(z.object({ name: z.string().min(1).max(60), values: z.array(z.number()), color: colorSchema.optional() }))
        .min(1)
        .max(4),
      format: formatSchema.optional(),
      height: plotHeightSchema,
    })
    .superRefine((d, ctx) =>
      d.series.forEach((s, i) => {
        if (s.values.length !== d.axes.length)
          ctx.addIssue({ code: 'custom', path: ['series', i, 'values'], message: `Expected ${d.axes.length} values (one per axis), got ${s.values.length}` });
      }),
    ),
  example: {
    title: 'Framework comparison',
    subtitle: 'Team survey, scores out of 10',
    axes: ['Performance', 'Ecosystem', 'Learning curve', 'Type safety', 'Tooling', 'Community'],
    series: [
      { name: 'Framework A', values: [9, 6, 5, 9, 8, 6] },
      { name: 'Framework B', values: [7, 9, 8, 6, 8, 9] },
    ],
  },
  width: 640,
  render(d, ctx) {
    const { theme } = ctx;
    const colors = d.series.map((s, i) => seriesColor(theme, i, s.color));
    const globalMax = niceMax(Math.max(...d.series.flatMap((s) => s.values)));
    const indicators = d.axes.map((a) => (typeof a === 'string' ? { name: a, max: globalMax } : { name: a.name, max: a.max ?? globalMax }));
    const legendItems = seriesLegend(d.series.map((s) => s.name), colors);
    const size = plotSize(ctx, d, legendItems, 0.68);
    const fmt = makeFormatter(d.format);
    const svg = renderChart(
      {
        radar: {
          indicator: indicators,
          shape: 'polygon',
          radius: '74%',
          center: ['50%', '52%'],
          splitNumber: 4,
          axisName: { color: theme.text2, fontSize: 12, fontWeight: 500 },
          axisNameGap: 10,
          splitLine: { lineStyle: { color: theme.grid, width: 1 } },
          splitArea: { show: false },
          axisLine: { lineStyle: { color: theme.grid, width: 1 } },
        },
        series: [
          {
            type: 'radar',
            symbol: 'circle',
            symbolSize: 7,
            data: d.series.map((s, i) => ({
              name: s.name,
              value: s.values,
              lineStyle: { color: colors[i], width: 2 },
              itemStyle: { color: colors[i], borderColor: theme.surface, borderWidth: 2 },
              areaStyle: { color: colors[i], opacity: 0.1 },
              // A single profile gets its values labeled; with several, the legend carries identity.
              label: d.series.length === 1 ? { show: true, color: theme.text2, fontSize: 11, formatter: (p: { value: number }) => fmt(p.value) } : undefined,
            })),
          },
        ],
      },
      size,
      theme,
    );
    return chartLayout(d, legendItems, svg);
  },
});
