import type { Template } from '../core/types.ts';
import { alarm } from './basic/alarm.ts';
import { activity } from './data/activity.ts';
import { sportsScore } from './data/sports-score.ts';
import { mediaCard } from './media/media-card.ts';
import { occasion } from './media/occasion.ts';
import { clock } from './basic/clock.ts';
import { volume } from './basic/volume.ts';
import { worldClock } from './basic/world-clock.ts';
import { stockQuote, watchlist } from './data/stock-quote.ts';
import { smartHome } from './media/smart-home.ts';
import { qrCode } from './basic/qr-code.ts';
import { monthCalendar } from './data/month-calendar.ts';
import { statusPage } from './data/status-page.ts';
import { taskBoard } from './data/task-board.ts';
import { map } from './media/map.ts';
import { diff } from './text/diff.ts';
import { math } from './text/math.ts';
import { steps } from './text/steps.ts';
import { alert } from './basic/alert.ts';
import { avatar } from './basic/avatar.ts';
import { badge } from './basic/badge.ts';
import { button } from './basic/button.ts';
import { calendarDate } from './basic/calendar-date.ts';
import { chat } from './basic/chat.ts';
import { countdown } from './basic/countdown.ts';
import { imageCard } from './basic/image-card.ts';
import { keyValue } from './basic/key-value.ts';
import { linkCard } from './basic/link-card.ts';
import { notification } from './basic/notification.ts';
import { rating } from './basic/rating.ts';
import { sparkline } from './basic/sparkline.ts';
import { tags } from './basic/tags.ts';
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
  // basic elements
  badge,
  alert,
  keyValue,
  button,
  linkCard,
  avatar,
  notification,
  chat,
  imageCard,
  rating,
  sparkline,
  tags,
  countdown,
  calendarDate,
  qrCode,
  volume,
  clock,
  worldClock,
  alarm,
  // text
  textCard,
  quote,
  markdown,
  code,
  list,
  steps,
  diff,
  math,
  // data
  table,
  stats,
  progress,
  timeline,
  comparison,
  agenda,
  statusPage,
  taskBoard,
  monthCalendar,
  stockQuote,
  watchlist,
  sportsScore,
  activity,
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
  map,
  smartHome,
  mediaCard,
  occasion,
  // layout
  dashboard,
] as Template[];
