import { z } from 'zod';
import { renderChart } from '../../core/echarts.ts';
import { html } from '../../core/html.ts';
import { wrapText } from '../../core/measure.ts';
import { colorSchema, formatSchema, makeFormatter, titleFields } from '../../core/format.ts';
import { seriesColor } from '../../core/theme.ts';
import { defineTemplate } from '../../core/types.ts';
import { chartLayout, plotHeightSchema, plotSize, seriesLegend, textWidth } from './common.ts';

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const mag = 10 ** Math.floor(Math.log10(v));
  const n = v / mag;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag;
}

export const radarChart = defineTemplate({
  id: 'radar_chart',
  title: 'Radar chart',
  summary: 'profile across several dimensions',
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
  css: /* css */ `
.rd-key{list-style:none;display:grid;grid-template-columns:repeat(auto-fill, minmax(200px, 1fr));gap:6px 18px;margin-top:12px;font-size:13px;color:var(--text-2)}
.rd-key li{display:flex;gap:8px;min-width:0}
.rd-key b{flex:none;width:20px;height:20px;border-radius:50%;background:var(--subtle);color:var(--text);font-size:11px;display:flex;align-items:center;justify-content:center}
`,
  render(d, ctx) {
    const { theme } = ctx;
    const colors = d.series.map((s, i) => seriesColor(theme, i, s.color));
    const globalMax = niceMax(Math.max(...d.series.flatMap((s) => s.values)));
    const indicators = d.axes.map((a) => (typeof a === 'string' ? { name: a, max: globalMax } : { name: a.name, max: a.max ?? globalMax }));
    const legendItems = seriesLegend(d.series.map((s) => s.name), colors);
    const size = plotSize(ctx, d, legendItems, 0.68);
    const fmt = makeFormatter(d.format);
    // Axis names wrap within a width that leaves the radar a usable radius.
    const nameWidth = Math.min(Math.max(...indicators.map((i) => textWidth(i.name, 12, true))) + 4, Math.max(70, size.width * 0.22));
    // Names that won't fit around the chart in two lines become numbers, with a key below.
    const numbered = indicators.some((i) => wrapText(i.name, nameWidth, 12, true).length > 2);
    const nameLines = numbered ? 1 : Math.max(...indicators.map((i) => wrapText(i.name, nameWidth, 12, true).length));
    const labelWidth = numbered ? 24 : nameWidth;
    const svg = renderChart(
      {
        radar: {
          indicator: indicators,
          shape: 'polygon',
          radius: Math.max(60, Math.min(size.height / 2 - 30 - nameLines * 15, size.width / 2 - labelWidth - 18)),
          center: ['50%', '52%'],
          splitNumber: 4,
          axisName: {
            color: theme.text2,
            fontSize: 12,
            fontWeight: numbered ? 700 : 500,
            formatter: (name: string) => (numbered ? String(indicators.findIndex((i) => i.name === name) + 1) : wrapText(name, nameWidth, 12, true).join('\n')),
          },
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
    const key = numbered
      ? html`<ol class="rd-key">${indicators.map((i, n) => html`<li><b>${n + 1}</b><span>${i.name}</span></li>`)}</ol>`
      : null;
    return chartLayout(d, legendItems, svg, { below: key });
  },
});
