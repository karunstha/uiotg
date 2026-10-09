import type { Template } from '../core/types.ts';
import { barChart } from './charts/bar-chart.ts';
import { calendarHeatmap } from './charts/calendar-heatmap.ts';
import { candlestick } from './charts/candlestick.ts';
import { echartsTemplate } from './charts/echarts.ts';
import { funnel } from './charts/funnel.ts';
import { gauge } from './charts/gauge.ts';
import { heatmap } from './charts/heatmap.ts';
import { lineChart } from './charts/line-chart.ts';
import { pieChart } from './charts/pie-chart.ts';
import { radarChart } from './charts/radar-chart.ts';
import { sankey } from './charts/sankey.ts';
import { scatterChart } from './charts/scatter-chart.ts';
import { treemap } from './charts/treemap.ts';
import { agenda } from './data/agenda.ts';
import { comparison } from './data/comparison.ts';
import { progress } from './data/progress.ts';
import { stats } from './data/stats.ts';
import { table } from './data/table.ts';
import { timeline } from './data/timeline.ts';
import { dashboard } from './layout/dashboard.ts';
import { albumCard } from './media/album-card.ts';
import { albumGrid } from './media/album-grid.ts';
import { profileCard } from './media/profile-card.ts';
import { weather } from './media/weather.ts';
import { code } from './text/code.ts';
import { list } from './text/list.ts';
import { markdown } from './text/markdown.ts';
import { quote } from './text/quote.ts';
import { textCard } from './text/text-card.ts';

/** Every built-in template, in catalog order. */
export const builtinTemplates: Template[] = [
  // text
  textCard,
  quote,
  markdown,
  code,
  list,
  // data
  table,
  stats,
  progress,
  timeline,
  comparison,
  agenda,
  // charts
  barChart,
  lineChart,
  pieChart,
  scatterChart,
  heatmap,
  radarChart,
  treemap,
  sankey,
  funnel,
  gauge,
  candlestick,
  calendarHeatmap,
  echartsTemplate,
  // media
  albumCard,
  albumGrid,
  profileCard,
  weather,
  // layout
  dashboard,
] as Template[];
