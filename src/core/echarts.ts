import * as echarts from 'echarts';
import { raw, type Html } from './html.ts';
import { measureText } from './measure.ts';
import type { Theme } from './theme.ts';

// ECharts lays out labels with its own text measurement; give it Inter's real
// advance widths so axis labels aren't clipped or overlapped in the browser.
echarts.setPlatformAPI({
  measureText(text: string, font?: string) {
    const size = Number(/(\d+(?:\.\d+)?)px/.exec(font ?? '')?.[1] ?? 12);
    const bold = /\b(bold|[6-9]00)\b/.test(font ?? '');
    return { width: measureText(text, size, bold) } as TextMetrics;
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
    textStyle: { fontFamily: 'Inter, system-ui, sans-serif', color: theme.text2, fontSize: 12 },
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

const themes = new Set<string>();

function themeName(theme: Theme): string {
  const name = `uiotg-${theme.mode}-${theme.accent}`;
  if (!themes.has(name)) {
    echarts.registerTheme(name, baseOption(theme));
    themes.add(name);
  }
  return name;
}

/** Renders an ECharts option to an inline SVG string on the server. */
export function renderChart(option: EChartsOption, size: ChartSize, theme: Theme): Html {
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
