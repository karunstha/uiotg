import { z } from 'zod';
import { renderChart } from '../../core/echarts.ts';
import { formatSchema, makeAxisFormatter, makeFormatter, titleFields, type Formatter } from '../../core/format.ts';
import type { Html } from '../../core/html.ts';
import { summaryStrip, SUMMARY_HEIGHT, type SummaryItem } from '../../core/ui.ts';
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
} from './common.ts';

type Radius = [number, number, number, number];

export const barChart = defineTemplate({
  id: 'bar_chart',
  title: 'Bar chart',
  category: 'chart',
  description:
    'Compare values across categories: vertical columns or horizontal bars, grouped or stacked, up to 8 series. Supports sorting, value labels and highlighting categories. Use for rankings, breakdowns and period comparisons.',
  schema: z
    .object({
      ...titleFields,
      categories: z.array(label).min(1).max(100).describe('Category labels, one per bar (group)'),
      series: z.array(seriesSchema).min(1).max(8, MAX_SERIES_MESSAGE),
      orientation: z
        .enum(['vertical', 'horizontal'])
        .optional()
        .describe('Default: horizontal when category labels are long or numerous'),
      stacked: z.boolean().default(false),
      format: formatSchema.optional(),
      show_values: z.boolean().optional().describe('Label bar ends with values; default on for a single series of ≤ 16 bars'),
      sort: z.enum(['none', 'asc', 'desc']).default('none').describe('Sort categories by total value'),
      highlight: z.array(label).max(20).optional().describe('Categories to emphasize; the rest are muted'),
      ...axisLabelFields,
      height: plotHeightSchema,
    })
    .superRefine((d, ctx) => checkLengths(d.series, d.categories.length, 'categories', ctx)),
  example: {
    title: 'Weekly active users by platform',
    subtitle: 'Thousands, last 6 weeks',
    categories: ['Aug 31', 'Sep 7', 'Sep 14', 'Sep 21', 'Sep 28', 'Oct 5'],
    series: [
      { name: 'iOS', values: [42, 44, 47, 46, 51, 55] },
      { name: 'Android', values: [38, 39, 41, 44, 45, 47] },
      { name: 'Web', values: [21, 20, 22, 25, 24, 27] },
    ],
    format: 'number',
  },
  width: 800,
  richWhen: (d) => d.categories.length >= 4,
  render(d, ctx) {
    const { theme } = ctx;
    const cats = d.categories.map(String);
    const order = cats.map((_, i) => i);
    const total = (i: number) => d.series.reduce((sum, s) => sum + (s.values[i] ?? 0), 0);
    if (d.sort !== 'none') order.sort((a, b) => (d.sort === 'asc' ? total(a) - total(b) : total(b) - total(a)));
    const categories = order.map((i) => cats[i]!);
    const series = d.series.map((s) => ({ ...s, values: order.map((i) => s.values[i] ?? null) }));
    const totals = order.map(total);

    const longest = Math.max(...categories.map((c) => c.length));
    const horizontal = d.orientation
      ? d.orientation === 'horizontal'
      : categories.length > 12 || longest > 18 || (longest > 10 && categories.length > 6);
    const colors = series.map((s, i) => seriesColor(theme, i, s.color));
    const fmt = makeFormatter(d.format);
    const axisFmt = makeAxisFormatter(d.format, d.stacked ? maxAbs(totals) : maxAbs(series.flatMap((s) => s.values)));
    const single = series.length === 1;
    const minimal = ctx.detail === 'minimal';
    // Minimal drops the value axis, so values move onto the bars whenever that stays readable.
    const showValues = d.show_values ?? (single && categories.length <= (minimal ? 24 : 16));
    const highlighted = new Set((d.highlight ?? []).map(String));

    // The outermost segment of each bar gets the rounded data-end.
    const ends = categories.map((_, ci) => {
      let pos = -1;
      let neg = -1;
      series.forEach((s, si) => {
        const v = s.values[ci];
        if (v != null && v > 0) pos = si;
        if (v != null && v < 0) neg = si;
      });
      return { pos, neg };
    });
    const radius = (negative: boolean): Radius =>
      horizontal ? (negative ? [4, 0, 0, 4] : [0, 4, 4, 0]) : negative ? [0, 0, 4, 4] : [4, 4, 0, 0];

    const legendItems = seriesLegend(series.map((s) => s.name), colors);
    const titles = axisTitles(d);
    const groupSize = d.stacked ? 1 : series.length;
    const band = Math.min(24, 120 / groupSize) * groupSize + 18;
    const defaultHeight = horizontal ? Math.min(1400, Math.max(140, categories.length * band + 28)) : undefined;
    const summary = ctx.detail === 'rich' ? barSummary(categories, series, totals, fmt) : null;
    const size = plotSize(ctx, { ...d, height: d.height ?? defaultHeight }, legendItems, 0.52, titles.reserve + (summary ? SUMMARY_HEIGHT : 0));

    const valueLabelWidth = Math.max(...(d.stacked ? totals : series.flatMap((s) => s.values.map((v) => v ?? 0))).map((v) => textWidth(fmt(v), 11)));
    const totalWidth = categories.reduce((w, c) => w + textWidth(c, 11) + 14, 0);
    const rotate = !horizontal && totalWidth > size.width ? 35 : 0;

    const categoryAxis = {
      type: 'category',
      data: categories,
      inverse: horizontal,
      axisLabel: horizontal
        ? { color: theme.text2, fontSize: 12, width: Math.min(180, size.width * 0.32), overflow: 'truncate', interval: 0 }
        : { rotate, hideOverlap: true, width: rotate ? 120 : undefined, overflow: rotate ? 'truncate' : undefined },
    };
    const valueAxis = {
      type: 'value',
      splitNumber: 4,
      axisLabel: { formatter: axisFmt, show: !(minimal && showValues) },
      splitLine: { show: !(minimal && showValues) },
    };

    const bars = series.map((s, si) => ({
      type: 'bar',
      name: s.name,
      stack: d.stacked ? 'total' : undefined,
      barMaxWidth: 24,
      barGap: '12%',
      barCategoryGap: '34%',
      // A surface-colored hairline separates stacked segments (the 2px surface gap).
      itemStyle: { color: colors[si], borderColor: theme.surface, borderWidth: d.stacked ? 1 : 0 },
      label:
        showValues && !d.stacked
          ? { show: true, position: horizontal ? 'right' : 'top', distance: 6, color: theme.text2, fontSize: 11, formatter: (p: { value: number }) => fmt(p.value) }
          : { show: false },
      data: s.values.map((v, ci) => {
        if (v == null) return null;
        const isEnd = !d.stacked || (v >= 0 ? ends[ci]!.pos === si : ends[ci]!.neg === si);
        const muted = highlighted.size > 0 && !highlighted.has(categories[ci]!);
        return {
          value: v,
          itemStyle: {
            borderRadius: isEnd ? radius(v < 0) : 0,
            ...(muted ? (single ? { color: theme.other } : { opacity: 0.32 }) : {}),
          },
          // Value labels sit at the bar's data end, which is below/left of zero for negatives.
          ...(v < 0 ? { label: { position: horizontal ? 'left' : 'bottom' } } : {}),
        };
      }),
    }));

    if (d.stacked && showValues) {
      // Zero-height segment on top of each stack that carries the total label.
      bars.push({
        type: 'bar',
        name: 'Total',
        stack: 'total',
        barMaxWidth: 24,
        barGap: '12%',
        barCategoryGap: '34%',
        itemStyle: { color: 'transparent', borderColor: 'transparent', borderWidth: 0 },
        label: {
          show: true,
          position: horizontal ? 'right' : 'top',
          distance: 6,
          color: theme.text2,
          fontSize: 11,
          formatter: (p: { dataIndex: number }) => fmt(totals[p.dataIndex]!),
        } as never,
        data: categories.map(() => ({ value: 0, itemStyle: { borderRadius: 0 } })),
      });
    }

    const svg = renderChart(
      {
        grid: grid({
          top: !horizontal && showValues ? 22 : 8,
          right: horizontal && showValues ? valueLabelWidth + 14 : 12,
        }),
        xAxis: horizontal ? valueAxis : categoryAxis,
        yAxis: horizontal ? categoryAxis : valueAxis,
        series: bars,
      },
      size,
      theme,
    );
    return chartLayout(d, legendItems, svg, { ...titles, summary, detail: ctx.detail });
  },
});

/** Rich summary: grand total, the leading category and its share, and the per-category average. */
function barSummary(categories: string[], series: Array<{ name: string; values: Array<number | null> }>, totals: number[], fmt: Formatter): Html | null {
  const grand = totals.reduce((a, b) => a + b, 0);
  if (!Number.isFinite(grand) || totals.length === 0) return null;
  let top = 0;
  totals.forEach((t, i) => {
    if (t > totals[top]!) top = i;
  });
  const items: SummaryItem[] = [{ label: 'Total', value: fmt(grand) }];
  if (grand > 0 && totals.every((t) => t >= 0)) {
    items.push({ label: 'Leader', value: categories[top]!, note: `${Math.round((totals[top]! / grand) * 100)}% of total` });
  }
  items.push({ label: 'Average', value: fmt(grand / totals.length), note: 'per category' });
  if (series.length >= 2 && series.length <= 3) {
    for (const s of series) items.push({ label: s.name, value: fmt(s.values.reduce<number>((a, v) => a + (v ?? 0), 0)) });
  }
  return summaryStrip(items);
}
