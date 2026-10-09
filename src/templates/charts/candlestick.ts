import { z } from 'zod';
import { renderChart } from '../../core/echarts.ts';
import { formatSchema, makeAxisFormatter, makeFormatter, titleFields } from '../../core/format.ts';
import { html } from '../../core/html.ts';
import { defineTemplate } from '../../core/types.ts';
import { chartLayout, grid, plotHeightSchema, plotSize, textWidth, type Series } from './common.ts';
import type { LegendItem } from '../../core/ui.ts';

function movingAverage(closes: number[], window: number): Array<number | null> {
  return closes.map((_, i) => {
    if (i < window - 1) return null;
    let sum = 0;
    for (let j = i - window + 1; j <= i; j++) sum += closes[j]!;
    return sum / window;
  });
}

export const candlestick = defineTemplate({
  id: 'candlestick',
  title: 'Candlestick (OHLC)',
  category: 'chart',
  description:
    'Price action as open/high/low/close candles with optional volume pane and moving averages. Use for stocks, crypto and any OHLC series.',
  schema: z.object({
    ...titleFields,
    candles: z
      .array(
        z.object({
          date: z.string().max(30),
          open: z.number(),
          high: z.number(),
          low: z.number(),
          close: z.number(),
          volume: z.number().nonnegative().optional(),
        }),
      )
      .min(2)
      .max(1500),
    format: formatSchema.optional().describe('Price format'),
    moving_averages: z.array(z.number().int().min(2).max(250)).max(3).optional().describe('Window sizes, e.g. [20, 50]'),
    show_volume: z.boolean().optional().describe('Default: on when candles include volume'),
    height: plotHeightSchema,
  }),
  example: {
    title: 'ACME · daily',
    subtitle: 'September 2026, USD',
    format: 'currency',
    moving_averages: [5],
    candles: [
      { date: 'Sep 1', open: 182.1, high: 184.9, low: 181.0, close: 184.2, volume: 31_200_000 },
      { date: 'Sep 2', open: 184.2, high: 186.3, low: 183.1, close: 185.7, volume: 28_400_000 },
      { date: 'Sep 3', open: 185.9, high: 186.0, low: 181.8, close: 182.5, volume: 39_900_000 },
      { date: 'Sep 4', open: 182.4, high: 183.6, low: 179.2, close: 180.1, volume: 41_300_000 },
      { date: 'Sep 5', open: 180.3, high: 182.8, low: 179.9, close: 182.2, volume: 30_100_000 },
      { date: 'Sep 8', open: 182.6, high: 187.4, low: 182.1, close: 186.9, volume: 36_800_000 },
      { date: 'Sep 9', open: 187.0, high: 189.5, low: 186.2, close: 188.8, volume: 33_000_000 },
      { date: 'Sep 10', open: 188.6, high: 189.1, low: 185.3, close: 186.0, volume: 29_500_000 },
      { date: 'Sep 11', open: 186.2, high: 190.4, low: 185.9, close: 189.9, volume: 35_700_000 },
      { date: 'Sep 12', open: 190.1, high: 192.8, low: 189.4, close: 192.1, volume: 38_200_000 },
      { date: 'Sep 15', open: 192.0, high: 193.0, low: 188.7, close: 189.3, volume: 34_400_000 },
      { date: 'Sep 16', open: 189.5, high: 191.2, low: 187.6, close: 190.6, volume: 27_900_000 },
      { date: 'Sep 17', open: 190.8, high: 194.6, low: 190.2, close: 194.1, volume: 40_800_000 },
      { date: 'Sep 18', open: 194.3, high: 196.2, low: 193.1, close: 195.4, volume: 37_100_000 },
      { date: 'Sep 19', open: 195.1, high: 195.8, low: 191.0, close: 191.8, volume: 44_600_000 },
      { date: 'Sep 22', open: 191.6, high: 193.3, low: 190.4, close: 192.9, volume: 26_300_000 },
      { date: 'Sep 23', open: 193.2, high: 197.0, low: 192.8, close: 196.5, volume: 39_400_000 },
      { date: 'Sep 24', open: 196.7, high: 198.9, low: 195.5, close: 198.2, volume: 42_000_000 },
      { date: 'Sep 25', open: 198.0, high: 198.4, low: 194.7, close: 195.3, volume: 36_500_000 },
      { date: 'Sep 26', open: 195.6, high: 199.7, low: 195.1, close: 199.1, volume: 45_900_000 },
    ],
  },
  width: 860,
  render(d, ctx) {
    const { theme } = ctx;
    const up = theme.status.good;
    const down = theme.status.critical;
    const fmt = makeFormatter(d.format);
    const showVolume = d.show_volume ?? d.candles.some((c) => c.volume != null);
    const closes = d.candles.map((c) => c.close);
    const maColors = [theme.series[0]!, theme.series[6]!, theme.series[3]!];
    const mas: Series[] = (d.moving_averages ?? []).map((w) => ({ name: `MA ${w}`, values: movingAverage(closes, w) }));
    const legendItems: LegendItem[] = [
      { name: 'Up', color: up },
      { name: 'Down', color: down },
      ...mas.map((m, i) => ({ name: m.name, color: maColors[i]!, shape: 'line' as const })),
    ];
    const size = plotSize(ctx, d, legendItems, 0.55);
    const volumeHeight = showVolume ? Math.round(size.height * 0.2) : 0;
    const gap = showVolume ? 30 : 0;
    const dates = d.candles.map((c) => c.date);
    const maxPrice = Math.max(...d.candles.map((c) => c.high));
    const last = d.candles[d.candles.length - 1]!;
    const first = d.candles[0]!;
    const change = (last.close - first.open) / first.open;

    const priceFmt = makeAxisFormatter(d.format, maxPrice);
    const volumeFmt = makeAxisFormatter('compact', 1e9);
    const maxVolume = Math.max(0, ...d.candles.map((c) => c.volume ?? 0));
    // Both panes share one explicit left edge so price and volume line up.
    const left = Math.ceil(Math.max(textWidth(priceFmt(maxPrice), 11), showVolume ? textWidth(volumeFmt(maxVolume), 10) : 0)) + 14;
    const xLabelBand = 24;
    const option: Record<string, unknown> = {
      grid: showVolume
        ? [
            { left, right: 12, top: 8, bottom: volumeHeight + gap + xLabelBand },
            { left, right: 12, bottom: xLabelBand, height: volumeHeight },
          ]
        : [grid({ top: 8, right: 12 })],
      xAxis: [
        { type: 'category', data: dates, gridIndex: 0, boundaryGap: true, axisLabel: { show: !showVolume, hideOverlap: true } },
        ...(showVolume ? [{ type: 'category', data: dates, gridIndex: 1, boundaryGap: true, axisLabel: { hideOverlap: true } }] : []),
      ],
      yAxis: [
        { type: 'value', scale: true, gridIndex: 0, splitNumber: 4, axisLabel: { formatter: priceFmt } },
        ...(showVolume
          ? [{ type: 'value', gridIndex: 1, splitNumber: 1, axisLabel: { formatter: volumeFmt, fontSize: 10 }, splitLine: { show: false } }]
          : []),
      ],
      series: [
        {
          type: 'candlestick',
          xAxisIndex: 0,
          yAxisIndex: 0,
          barMaxWidth: 14,
          itemStyle: { color: up, color0: down, borderColor: up, borderColor0: down, borderWidth: 1.5 },
          data: d.candles.map((c) => [c.open, c.close, c.low, c.high]),
        },
        ...mas.map((m, i) => ({
          type: 'line',
          name: m.name,
          xAxisIndex: 0,
          yAxisIndex: 0,
          data: m.values,
          showSymbol: false,
          smooth: 0.2,
          lineStyle: { width: 1.5, color: maColors[i] },
        })),
        ...(showVolume
          ? [
              {
                type: 'bar',
                xAxisIndex: 1,
                yAxisIndex: 1,
                barMaxWidth: 14,
                data: d.candles.map((c) => ({
                  value: c.volume ?? 0,
                  itemStyle: { color: c.close >= c.open ? up : down, opacity: 0.45, borderRadius: [2, 2, 0, 0] },
                })),
              },
            ]
          : []),
      ],
    };

    const svg = renderChart(option, size, theme);
    const aside = html`<div style="text-align:right">
      <div style="font-size:20px;font-weight:650;color:var(--text);letter-spacing:-0.01em">${fmt(last.close)}</div>
      <div class="${`delta ${change >= 0 ? 'pos' : 'neg'}`}" style="justify-content:flex-end">${change >= 0 ? '+' : '−'}${(Math.abs(change) * 100).toFixed(2)}%</div>
    </div>`;
    return chartLayout(d, legendItems, svg, { aside });
  },
});
