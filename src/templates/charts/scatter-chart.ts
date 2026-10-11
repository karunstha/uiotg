import { z } from 'zod';
import { renderChart } from '../../core/echarts.ts';
import { colorSchema, formatSchema, makeAxisFormatter, titleFields } from '../../core/format.ts';
import { seriesColor } from '../../core/theme.ts';
import { defineTemplate } from '../../core/types.ts';
import { axisLabelFields, axisTitles, chartLayout, grid, maxAbs, plotHeightSchema, plotSize, seriesLegend } from './common.ts';
import type { Html } from '../../core/html.ts';
import { summaryStrip, SUMMARY_HEIGHT } from '../../core/ui.ts';

const point = z.union([
  z.tuple([z.number(), z.number()]),
  z.tuple([z.number(), z.number(), z.number()]),
  z.object({
    x: z.number(),
    y: z.number(),
    size: z.number().nonnegative().optional().describe('Bubble size (area-proportional)'),
    label: z.string().max(40).optional().describe('Direct label; use only for the few points worth calling out'),
  }),
]);

interface Point {
  x: number;
  y: number;
  size?: number;
  label?: string;
}

function toPoint(p: z.infer<typeof point>): Point {
  if (Array.isArray(p)) return { x: p[0], y: p[1], size: p[2] };
  return p;
}

/** Least-squares fit; null when x has no spread. */
function regression(points: Point[]): { slope: number; intercept: number } | null {
  const n = points.length;
  if (n < 2) return null;
  const mx = points.reduce((s, p) => s + p.x, 0) / n;
  const my = points.reduce((s, p) => s + p.y, 0) / n;
  let num = 0;
  let den = 0;
  for (const p of points) {
    num += (p.x - mx) * (p.y - my);
    den += (p.x - mx) ** 2;
  }
  if (den === 0) return null;
  const slope = num / den;
  return { slope, intercept: my - slope * mx };
}

export const scatterChart = defineTemplate({
  id: 'scatter_chart',
  title: 'Scatter / bubble chart',
  summary: 'relationship between two measures',
  category: 'chart',
  description:
    'Relationship between two numeric variables, with optional bubble size, a few labeled points and per-series trend lines. Keep to ≤ 3 series so colors stay distinguishable.',
  schema: z.object({
    ...titleFields,
    series: z
      .array(
        z.object({
          name: z.string().min(1).max(80),
          points: z.array(point).min(1).max(5000).describe('[x, y], [x, y, size] or {x, y, size?, label?}'),
          color: colorSchema.optional(),
        }),
      )
      .min(1)
      .max(8),
    x_format: formatSchema.optional(),
    y_format: formatSchema.optional(),
    trendline: z.boolean().optional().describe('Fit and draw a least-squares line per series (default: on at the rich detail level)'),
    ...axisLabelFields,
    height: plotHeightSchema,
  }),
  example: {
    title: 'Price vs. rating',
    subtitle: 'Wireless headphones, bubble size = monthly reviews',
    x_label: 'Price (USD)',
    y_label: 'Average rating',
    x_format: 'currency_compact',
    trendline: true,
    series: [
      {
        name: 'Over-ear',
        points: [
          { x: 349, y: 4.6, size: 1200, label: 'Studio Pro' },
          { x: 299, y: 4.4, size: 860 },
          { x: 249, y: 4.3, size: 640 },
          { x: 179, y: 4.1, size: 900 },
          { x: 129, y: 3.9, size: 520 },
          { x: 399, y: 4.5, size: 410 },
          { x: 89, y: 3.7, size: 300 },
        ],
      },
      {
        name: 'In-ear',
        points: [
          { x: 249, y: 4.5, size: 1500, label: 'Buds Max' },
          { x: 199, y: 4.3, size: 1100 },
          { x: 149, y: 4.2, size: 700 },
          { x: 99, y: 4.0, size: 1300 },
          { x: 59, y: 3.6, size: 950, label: 'Budget pick' },
          { x: 39, y: 3.4, size: 400 },
        ],
      },
    ],
  },
  width: 800,
  richWhen: (d) => d.series.reduce((n, s) => n + s.points.length, 0) >= 10,
  render(d, ctx) {
    const { theme } = ctx;
    const colors = d.series.map((s, i) => seriesColor(theme, i, s.color));
    const data = d.series.map((s) => s.points.map(toPoint));
    const all = data.flat();
    const sizes = all.map((p) => p.size).filter((s): s is number => s != null);
    const maxSize = Math.max(0, ...sizes);
    // Area-proportional bubbles between 8px and 44px in diameter.
    const diameter = (s?: number) => (s == null || maxSize === 0 ? 9 : 8 + 36 * Math.sqrt(s / maxSize));
    const legendItems = seriesLegend(d.series.map((s) => s.name), colors, 'dot');
    const titles = axisTitles(d);
    const rich = ctx.detail === 'rich';
    const minimal = ctx.detail === 'minimal';
    const trend = d.trendline ?? rich;
    const summary = rich ? correlationSummary(d.series.map((s) => s.name), data) : null;
    const size = plotSize(ctx, d, legendItems, 0.56, titles.reserve + (summary ? SUMMARY_HEIGHT : 0));
    const xs = all.map((p) => p.x);
    const midX = (Math.min(...xs) + Math.max(...xs)) / 2;

    const series: unknown[] = d.series.map((s, si) => ({
      type: 'scatter',
      name: s.name,
      data: data[si]!.map((p) => ({
        value: [p.x, p.y],
        symbolSize: diameter(p.size),
        // Labels sit on the side of the point facing the plot's center, so they stay inside it.
        label: p.label && !minimal ? { show: true, formatter: p.label, position: p.x > midX ? 'left' : 'right', width: 140, overflow: 'break' } : undefined,
      })),
      itemStyle: { color: colors[si], opacity: sizes.length ? 0.78 : 0.9, borderColor: theme.surface, borderWidth: 2 },
      label: { show: false, position: 'right', distance: 6, color: theme.text, fontSize: 11, fontWeight: 500 },
    }));

    if (trend && !minimal) {
      d.series.forEach((_, si) => {
        const fit = regression(data[si]!);
        if (!fit) return;
        const px = data[si]!.map((p) => p.x);
        const lo = Math.min(...px);
        const hi = Math.max(...px);
        series.push({
          type: 'line',
          name: `${d.series[si]!.name} trend`,
          data: [
            [lo, fit.intercept + fit.slope * lo],
            [hi, fit.intercept + fit.slope * hi],
          ],
          showSymbol: false,
          lineStyle: { color: colors[si], width: 1.5, type: [5, 4], opacity: 0.9 },
          z: 1,
        });
      });
    }

    const svg = renderChart(
      {
        grid: grid({ top: 16, right: 20 }),
        xAxis: {
          type: 'value',
          scale: true,
          splitNumber: 5,
          axisLine: { show: true },
          axisLabel: { formatter: makeAxisFormatter(d.x_format, maxAbs(xs)) },
          splitLine: { show: !minimal },
        },
        yAxis: {
          type: 'value',
          scale: true,
          splitNumber: 5,
          axisLabel: { formatter: makeAxisFormatter(d.y_format, maxAbs(all.map((p) => p.y))) },
          splitLine: { show: !minimal },
        },
        series,
      },
      size,
      theme,
    );
    return chartLayout(d, legendItems, svg, { ...titles, summary, detail: ctx.detail });
  },
});

/** Pearson correlation coefficient, or null without spread. */
function pearson(points: Point[]): number | null {
  const n = points.length;
  if (n < 3) return null;
  const mx = points.reduce((s, p) => s + p.x, 0) / n;
  const my = points.reduce((s, p) => s + p.y, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (const p of points) {
    sxy += (p.x - mx) * (p.y - my);
    sxx += (p.x - mx) ** 2;
    syy += (p.y - my) ** 2;
  }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : null;
}

function describeR(r: number): string {
  const a = Math.abs(r);
  const strength = a >= 0.7 ? 'strong' : a >= 0.4 ? 'moderate' : a >= 0.2 ? 'weak' : 'no clear';
  return a < 0.2 ? 'no clear relationship' : `${strength} ${r > 0 ? 'positive' : 'negative'}`;
}

/** Rich summary: correlation per series (r and a plain-language reading). */
function correlationSummary(names: string[], data: Point[][]): Html | null {
  const items = data.flatMap((pts, i) => {
    const r = pearson(pts);
    return r == null ? [] : [{ label: names.length > 1 ? `${names[i]} · r` : 'Correlation · r', value: r.toFixed(2), note: describeR(r) }];
  });
  return items.length ? summaryStrip([...items.slice(0, 3), { label: 'Points', value: String(data.flat().length) }]) : null;
}
