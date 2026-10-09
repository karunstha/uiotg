import { z } from 'zod';
import { renderChart } from '../../core/echarts.ts';
import { formatSchema, makeAxisFormatter, makeFormatter, titleFields, type Formatter } from '../../core/format.ts';
import type { Html } from '../../core/html.ts';
import { neutralChange, seriesStats, summaryStrip, SUMMARY_HEIGHT } from '../../core/ui.ts';
import { seriesColor } from '../../core/theme.ts';
import { defineTemplate } from '../../core/types.ts';
import {
  axisLabelFields,
  axisTitles,
  chartLayout,
  checkLengths,
  grid,
  label,
  MAX_SERIES_MESSAGE,
  maxAbs,
  plotHeightSchema,
  plotSize,
  seriesLegend,
  seriesSchema,
  textWidth,
  type Series,
} from './common.ts';

function lastValue(values: Array<number | null>): number | null {
  for (let i = values.length - 1; i >= 0; i--) if (values[i] != null) return values[i]!;
  return null;
}

/** True when any two series end within ~18px of each other on the plot. */
function endLabelsCollide(
  series: Array<{ values: Array<number | null> }>,
  stacked: boolean,
  plotHeight: number,
  yMin?: number,
  yMax?: number,
): boolean {
  let running = 0;
  const ends = series.map((s) => {
    const v = lastValue(s.values) ?? 0;
    running = stacked ? running + v : v;
    return running;
  });
  const all = series.flatMap((s) => s.values).filter((v): v is number => v != null);
  const lo = yMin ?? Math.min(0, ...all);
  const hi = yMax ?? Math.max(...(stacked ? ends : all));
  // Axes round outward to nice numbers, so assume ~15% more range than the data.
  const pxPerUnit = (plotHeight * 0.85) / ((hi - lo) * 1.15 || 1);
  for (let i = 0; i < ends.length; i++)
    for (let j = i + 1; j < ends.length; j++) if (Math.abs(ends[i]! - ends[j]!) * pxPerUnit < 18) return true;
  return false;
}

export const lineChart = defineTemplate({
  id: 'line_chart',
  title: 'Line / area chart',
  category: 'chart',
  description:
    'Change over time or along an ordered axis: one or more lines (up to 8), optionally as (stacked) areas, with end labels and horizontal reference lines for targets or thresholds.',
  schema: z
    .object({
      ...titleFields,
      x: z.array(label).min(2).max(2000).describe('X-axis labels shared by all series (dates, months, steps), in order'),
      series: z.array(seriesSchema).min(1).max(8, MAX_SERIES_MESSAGE),
      area: z.boolean().default(false).describe('Fill under each line with a light wash'),
      stacked: z.boolean().default(false).describe('Stack series (implies area)'),
      smooth: z.boolean().default(false),
      markers: z.boolean().default(false).describe('Dot on every point (default: only the last point)'),
      end_labels: z.boolean().optional().describe('Name each line at its end; default on for 2–4 series'),
      format: formatSchema.optional(),
      y_min: z.number().optional(),
      y_max: z.number().optional(),
      reference_lines: z
        .array(z.object({ value: z.number(), label: z.string().max(40).optional() }))
        .max(5)
        .optional()
        .describe('Horizontal guides such as a target or SLO threshold'),
      ...axisLabelFields,
      height: plotHeightSchema,
    })
    .superRefine((d, ctx) => checkLengths(d.series, d.x.length, 'x values', ctx)),
  example: {
    title: 'API latency',
    subtitle: 'p50 and p95 response time, ms',
    x: ['00:00', '02:00', '04:00', '06:00', '08:00', '10:00', '12:00', '14:00', '16:00', '18:00', '20:00', '22:00'],
    series: [
      { name: 'p95', values: [182, 176, 171, 174, 205, 248, 262, 251, 239, 228, 204, 190] },
      { name: 'p50', values: [64, 61, 60, 62, 71, 84, 90, 86, 82, 78, 70, 66] },
    ],
    reference_lines: [{ value: 250, label: 'SLO 250 ms' }],
    format: { suffix: ' ms' },
  },
  width: 800,
  richWhen: (d) => d.x.length >= 8 && d.series.length <= 4,
  render(d, ctx) {
    const { theme } = ctx;
    const x = d.x.map(String);
    const colors = d.series.map((s, i) => seriesColor(theme, i, s.color));
    const fmt = makeFormatter(d.format);
    const all = d.series.flatMap((s) => s.values);
    const axisFmt = makeAxisFormatter(d.format, maxAbs(all));
    const n = d.series.length;
    const area = d.area || d.stacked;
    const legendItems = seriesLegend(d.series.map((s) => s.name), colors, 'line');
    const titles = axisTitles(d);
    const rich = ctx.detail === 'rich';
    const minimal = ctx.detail === 'minimal';
    const summary = rich ? lineSummary(d, x, fmt) : null;
    const size = plotSize(ctx, d, legendItems, 0.48, titles.reserve + (summary ? SUMMARY_HEIGHT : 0));
    // Rich, single series: call out the high and low points (selective direct labels).
    const extremes = rich && n === 1 ? seriesStats(d.series[0]!.values) : null;
    // End labels only when they won't collide; converging lines fall back to the legend.
    const endLabels = d.end_labels ?? (n >= 2 && n <= 4 && !endLabelsCollide(d.series, d.stacked, size.height, d.y_min, d.y_max));
    const markers = d.markers && !minimal && x.length <= 80;
    const endLabelWidth = endLabels ? Math.max(...d.series.map((s) => textWidth(s.name, 12))) + 16 : 0;

    const lines = d.series.map((s, si) => {
      let last = -1;
      s.values.forEach((v, i) => {
        if (v != null) last = i;
      });
      return {
        type: 'line',
        name: s.name,
        stack: d.stacked ? 'total' : undefined,
        smooth: d.smooth ? 0.35 : false,
        connectNulls: false,
        symbol: 'circle',
        showSymbol: true,
        // End dot (r=4) with a surface ring; interior points only when markers are on.
        symbolSize: (_: unknown, p: { dataIndex: number }) => (p.dataIndex === last ? 9 : markers ? 7 : 0),
        lineStyle: { width: 2, color: colors[si], cap: 'round', join: 'round' },
        itemStyle: { color: colors[si], borderColor: theme.surface, borderWidth: 2 },
        areaStyle: area ? { color: colors[si], opacity: d.stacked ? 0.16 : 0.1 } : undefined,
        endLabel: endLabels
          ? { show: true, formatter: '{a}', color: theme.text2, fontSize: 12, distance: 10 }
          : undefined,
        markLine:
          si === 0 && d.reference_lines?.length
            ? {
                silent: true,
                symbol: 'none',
                lineStyle: { color: theme.text2, width: 1, type: [4, 4], opacity: 0.8 },
                label: { position: 'insideEndTop', color: theme.text2, fontSize: 11, formatter: (p: { name: string }) => p.name },
                data: d.reference_lines.map((r) => ({ yAxis: r.value, name: r.label ?? fmt(r.value) })),
              }
            : undefined,
        markPoint:
          extremes && extremes.max !== extremes.min
            ? {
                symbol: 'circle',
                symbolSize: 8,
                itemStyle: { color: colors[si], borderColor: theme.surface, borderWidth: 2 },
                label: { show: true, color: theme.text2, fontSize: 11, fontWeight: 500, formatter: (p: { value: number }) => fmt(p.value) },
                data: [
                  { coord: [extremes.maxIndex, extremes.max], value: extremes.max, label: { position: 'top', distance: 6 } },
                  { coord: [extremes.minIndex, extremes.min], value: extremes.min, label: { position: 'bottom', distance: 6 } },
                ],
              }
            : undefined,
        data: s.values,
      };
    });

    const svg = renderChart(
      {
        grid: grid({ top: 14, right: Math.max(12, endLabelWidth) }),
        xAxis: { type: 'category', data: x, boundaryGap: false, axisLabel: { hideOverlap: true } },
        yAxis: {
          type: 'value',
          splitNumber: minimal ? 2 : 4,
          min: d.y_min,
          max: d.y_max,
          axisLabel: { formatter: axisFmt },
          splitLine: { show: !minimal },
        },
        series: lines,
      },
      size,
      theme,
    );
    return chartLayout(d, legendItems, svg, { ...titles, summary, detail: ctx.detail });
  },
});

/** Rich summary: latest/change/high/low/average for one series, latest + change per series for 2–4. */
function lineSummary(d: { series: Series[]; stacked: boolean }, x: string[], fmt: Formatter): Html | null {
  if (d.stacked) {
    const totals = x.map((_, i) => d.series.reduce((sum, s) => sum + (s.values[i] ?? 0), 0));
    const st = seriesStats(totals);
    return st ? summaryStrip([{ label: `Total · ${x[x.length - 1]}`, value: fmt(st.last), note: st.change != null ? neutralChange(st.change) : null }]) : null;
  }
  if (d.series.length === 1) {
    const st = seriesStats(d.series[0]!.values);
    if (!st) return null;
    return summaryStrip([
      { label: `Latest · ${x[x.length - 1]}`, value: fmt(st.last), note: st.change != null ? neutralChange(st.change) : null },
      { label: 'High', value: fmt(st.max), note: x[st.maxIndex] },
      { label: 'Low', value: fmt(st.min), note: x[st.minIndex] },
      { label: 'Average', value: fmt(st.avg) },
    ]);
  }
  if (d.series.length > 4) return null;
  return summaryStrip(
    d.series.flatMap((s) => {
      const st = seriesStats(s.values);
      return st ? [{ label: `${s.name} · ${x[x.length - 1]}`, value: fmt(st.last), note: st.change != null ? neutralChange(st.change) : null }] : [];
    }),
  );
}
