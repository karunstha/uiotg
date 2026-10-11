import * as echarts from 'echarts';
import { raw, type Html } from './html.ts';
import { measureText, metricsFamily } from './measure.ts';
import type { Theme } from './theme.ts';

// ECharts lays out labels with its own text measurement; give it the real
// advance widths of the theme's font so axis labels aren't clipped or overlapped.
echarts.setPlatformAPI({
  measureText(text: string, font?: string) {
    const size = Number(/(\d+(?:\.\d+)?)px/.exec(font ?? '')?.[1] ?? 12);
    const bold = /\b(bold|[6-9]00)\b/.test(font ?? '');
    return { width: measureText(text, size, bold, metricsFamily(font)) } as TextMetrics;
  },
});

export type EChartsOption = echarts.EChartsCoreOption;

export interface ChartSize {
  width: number;
  height: number;
}

/** Shared axis/text styling so every chart reads as one system. */
export function baseOption(theme: Theme): EChartsOption {
  const axisCommon = {
    axisLine: { show: true, lineStyle: { color: theme.axis, width: 1 } },
    axisTick: { show: false },
    axisLabel: { color: theme.muted, fontSize: 11, margin: 10 },
    splitLine: { show: true, lineStyle: { color: theme.grid, width: 1, type: 'solid' } },
    nameTextStyle: { color: theme.text2, fontSize: 12 },
  };
  return {
    animation: false,
    backgroundColor: 'transparent',
    color: [...theme.series],
    textStyle: { fontFamily: theme.fontSans, color: theme.text2, fontSize: 12 },
    tooltip: { show: false },
    legend: { show: false },
    categoryAxis: { ...axisCommon, splitLine: { show: false } },
    valueAxis: { ...axisCommon, axisLine: { show: false } },
    timeAxis: { ...axisCommon, splitLine: { show: false } },
    logAxis: { ...axisCommon, axisLine: { show: false } },
    // Series defaults that would otherwise hard-code white fills.
    boxplot: { itemStyle: { color: theme.surface, borderWidth: 1.5 } },
  };
}

/** Registered ECharts themes, keyed by the full uiotg theme (custom themes vary in every token). */
const themes = new Map<string, string>();

function themeName(theme: Theme): string {
  const key = JSON.stringify(theme);
  let name = themes.get(key);
  if (!name) {
    name = `uiotg-${themes.size}`;
    echarts.registerTheme(name, baseOption(theme));
    themes.set(key, name);
  }
  return name;
}

/** Fonts whose line box is taller than Inter's: bottom axis labels need a little more room. */
const TALL_FONTS = new Set(['Source Serif 4', 'Nunito']);

/** Grows each numeric grid bottom by `extra` px. */
function padGrid(option: EChartsOption, extra: number): EChartsOption {
  if (!extra || !option.grid) return option;
  const pad = (g: Record<string, unknown>) => (typeof g.bottom === 'number' ? { ...g, bottom: g.bottom + extra } : g);
  return { ...option, grid: Array.isArray(option.grid) ? option.grid.map(pad) : pad(option.grid as Record<string, unknown>) };
}

/** Renders an ECharts option to an inline SVG string on the server. */
export function renderChart(option: EChartsOption, size: ChartSize, theme: Theme): Html {
  option = padGrid(option, TALL_FONTS.has(metricsFamily(theme.fontSans) ?? '') ? 4 : 0);
  const chart = echarts.init(null, themeName(theme), {
    renderer: 'svg',
    ssr: true,
    width: Math.max(10, Math.round(size.width)),
    height: Math.max(10, Math.round(size.height)),
  });
  try {
    chart.setOption({ animation: false, tooltip: { show: false }, ...option });
    const svg = chart
      .renderToSVGString()
      // Hover styles and event metadata are meaningless in a static image.
      .replace(/<style[^>]*>[\s\S]*?<\/style>/g, '')
      .replace(/\s(ecmeta_[a-z_]+|class|pointer-events)="[^"]*"/g, '');
    return raw(svg);
  } finally {
    // Disposing also stops zrender's animation loop, which would keep Node alive.
    chart.dispose();
  }
}
