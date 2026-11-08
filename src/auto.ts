import { z } from 'zod';
import type { FormatSpec } from './core/format.ts';
import type { Registry } from './registry.ts';

/**
 * Picks a template for raw data. Deterministic rules, no model involved:
 * the caller sends whatever it has (a number, a list, rows, a record, text)
 * and gets back a template id, data shaped for it, and a one-line reason.
 */

export const intentSchema = z
  .enum(['trend', 'compare', 'share', 'relationship', 'summary'])
  .describe('Optional hint: trend (over time), compare (rank categories), share (part of a whole), relationship (x vs y), summary (headline numbers)');

export type Intent = z.infer<typeof intentSchema>;

export interface VisualizeInput {
  data: unknown;
  title?: string;
  subtitle?: string;
  intent?: Intent;
  /** The screen the result will be rendered on; a small one gets compact layouts. */
  screen?: Screen;
}

export interface Choice {
  template: string;
  data: Record<string, unknown>;
  reason: string;
}

type Row = Record<string, unknown>;
type Kind = 'number' | 'time' | 'category' | 'boolean' | 'other';

// --- value helpers -------------------------------------------------------------

const NUMERIC = /^\s*([-+−]?)\s*([$€£¥]?)\s*(\d{1,3}(?:,\d{3})+|\d+)?(\.\d+)?\s*([kmb%])?\s*$/i;

/** Parses numbers and numeric strings like "1,234", "$4.2", "12%", "3.5k". */
function toNumber(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;
  const m = NUMERIC.exec(v);
  if (!m || (!m[3] && !m[4])) return null;
  let n = Number(`${m[3] ?? '0'}${m[4] ?? ''}`.replace(/,/g, ''));
  const suffix = m[5]?.toLowerCase();
  if (suffix === 'k') n *= 1e3;
  if (suffix === 'm') n *= 1e6;
  if (suffix === 'b') n *= 1e9;
  return m[1] === '-' || m[1] === '−' ? -n : n;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const ISO = /^\d{4}-\d{2}(-\d{2})?([T ][\d:.]+Z?([+-]\d{2}:?\d{2})?)?$/;

function isTimeLike(v: unknown): boolean {
  if (typeof v !== 'string') return false;
  const s = v.trim().toLowerCase();
  return (
    ISO.test(s) ||
    /^q[1-4]\b/.test(s) ||
    /^(fy)?\d{4}\s*q[1-4]$/.test(s) ||
    /^w(eek)?\s?\d{1,2}\b/.test(s) ||
    /^\d{1,2}:\d{2}/.test(s) ||
    MONTHS.some((m) => s.startsWith(m)) ||
    DAYS.some((d) => s.startsWith(d))
  );
}

const TIME_NAME = /^(date|time|timestamp|day|week|month|year|quarter|period|hour|ts|at)$|_(date|at|time|day|month|year)$|^(date|time|day|month|year)_/i;

/** "monthly_revenue" / "monthlyRevenue" → "Monthly revenue". */
export function humanize(key: string): string {
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Short x labels for ISO dates: "Oct 9", or "Oct 2025" for monthly data spanning years. */
function formatTimeLabels(values: string[]): string[] {
  if (!values.every((v) => ISO.test(v.trim()))) return values;
  const dates = values.map((v) => new Date(v.length === 7 ? `${v}-01` : v));
  if (dates.some((d) => Number.isNaN(d.getTime()))) return values;
  const monthly = values.every((v) => v.length === 7) || dates.every((d) => d.getUTCDate() === 1);
  const years = new Set(dates.map((d) => d.getUTCFullYear()));
  const hasTime = values.some((v) => /[T ]\d/.test(v));
  return dates.map((d) => {
    const mon = MONTHS[d.getUTCMonth()]!.replace(/^./, (c) => c.toUpperCase());
    if (hasTime) return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
    if (monthly) return years.size > 1 ? `${mon} ${d.getUTCFullYear()}` : mon;
    return years.size > 1 ? `${mon} ${d.getUTCDate()}, ${d.getUTCFullYear()}` : `${mon} ${d.getUTCDate()}`;
  });
}

/** Infers a display format from a column name and its values. */
export function inferFormat(name: string, raw: unknown[], nums: number[]): FormatSpec | undefined {
  const strings = raw.filter((v): v is string => typeof v === 'string');
  const big = Math.max(0, ...nums.map(Math.abs)) >= 10_000;
  const money = /price|revenue|cost|amount|spend|sales|income|profit|budget|usd|eur|salary|mrr|arr|gmv/i.test(name) || strings.some((s) => /^[-−]?\s*[$€£¥]/.test(s));
  if (money) return big ? 'currency_compact' : 'currency';
  const pctName = /percent|pct|rate|ratio|share|margin|conversion|churn|growth/i.test(name);
  if (strings.some((s) => s.trim().endsWith('%'))) return { suffix: '%' };
  if (pctName && nums.every((n) => Math.abs(n) <= 1)) return 'percent';
  if (pctName && nums.every((n) => Math.abs(n) <= 100)) return { suffix: '%' };
  if (big) return 'compact';
  return undefined;
}

interface Column {
  key: string;
  label: string;
  kind: Kind;
  nums: number[];
  distinct: number;
  format?: FormatSpec;
}

function analyze(rows: Row[]): Column[] {
  const keys: string[] = [];
  for (const r of rows.slice(0, 100)) for (const k of Object.keys(r)) if (!keys.includes(k)) keys.push(k);
  return keys.map((key) => {
    const raw = rows.map((r) => r[key]).filter((v) => v != null && v !== '');
    const nums = raw.map(toNumber).filter((n): n is number => n != null);
    const numeric = raw.length > 0 && nums.length >= raw.length * 0.9;
    const timeValues = raw.filter(isTimeLike).length >= raw.length * 0.9;
    const yearInts = numeric && /year/i.test(key) && nums.every((n) => Number.isInteger(n) && n > 1900 && n < 2200);
    let kind: Kind = 'other';
    if (raw.length && raw.every((v) => typeof v === 'boolean')) kind = 'boolean';
    else if (yearInts || (raw.length && timeValues) || (TIME_NAME.test(key) && !numeric)) kind = 'time';
    else if (numeric) kind = 'number';
    else if (raw.every((v) => typeof v === 'string')) kind = 'category';
    return {
      key,
      label: humanize(key),
      kind,
      nums: kind === 'number' ? rows.map((r) => toNumber(r[key]) ?? NaN) : [],
      distinct: new Set(raw.map(String)).size,
      format: kind === 'number' ? inferFormat(key, raw, nums) : undefined,
    };
  });
}

const maxAbs = (ns: number[]) => Math.max(0, ...ns.filter(Number.isFinite).map(Math.abs));
const clean = (ns: number[]) => ns.map((n) => (Number.isFinite(n) ? n : null));

/** Measures whose largest values differ by more than this factor don't share one axis. */
const SCALE_SPLIT = 20;

function similarScale(cols: Column[]): boolean {
  const peaks = cols.map((c) => maxAbs(c.nums)).filter((p) => p > 0);
  return peaks.length < 2 || Math.max(...peaks) / Math.min(...peaks) <= SCALE_SPLIT;
}

/** Pie data for parts of a whole; when they're already percentages, lead with the biggest share. */
function pieData(labels: string[], values: number[], format?: FormatSpec): Record<string, unknown> {
  const total = values.reduce((a, b) => a + b, 0);
  const percent = Math.abs(total - 100) <= 1 ? { suffix: '%' } : Math.abs(total - 1) <= 0.01 ? 'percent' : undefined;
  const slices = labels.map((label, i) => ({ label, value: values[i] ?? 0 }));
  if (!percent) return { slices, format };
  const top = slices.reduce((a, b) => (b.value > a.value ? b : a));
  const fmt = percent === 'percent' ? `${Math.round(top.value * 100)}%` : `${Math.round(top.value)}%`;
  return { slices, format: percent, center_value: fmt, center_label: top.label };
}

function sumsToWhole(values: number[]): boolean {
  const total = values.reduce((a, b) => a + b, 0);
  return values.every((v) => v >= 0) && (Math.abs(total - 100) <= 1 || Math.abs(total - 1) <= 0.01);
}

// --- shapes ----------------------------------------------------------------------

function fromRows(rows: Row[], intent: Intent | undefined, title?: string): Choice {
  const cols = analyze(rows);
  const nums = cols.filter((c) => c.kind === 'number');
  const time = cols.find((c) => c.kind === 'time');
  const cats = cols.filter((c) => c.kind === 'category');

  // Coordinates → map, labelled by the first text column.
  const latCol = cols.find((c) => c.kind === 'number' && /^(lat|latitude)$/i.test(c.key));
  const lonCol = cols.find((c) => c.kind === 'number' && /^(lon|lng|long|longitude)$/i.test(c.key));
  if (latCol && lonCol && rows.length <= 300) {
    const name = cats[0];
    return {
      template: 'map',
      data: {
        markers: rows
          .map((r, i) => ({ lat: latCol.nums[i]!, lon: lonCol.nums[i]!, ...(name ? { label: String(r[name.key] ?? '').slice(0, 60) } : {}) }))
          .filter((m) => Number.isFinite(m.lat) && Number.isFinite(m.lon)),
      },
      reason: `${rows.length} location${rows.length === 1 ? '' : 's'} with coordinates`,
    };
  }

  if (rows.length === 1) {
    return {
      template: 'key_value',
      data: { items: cols.map((c) => ({ label: c.label, value: (rows[0]![c.key] as never) ?? null, format: c.format })) },
      reason: 'a single record reads best as label/value rows',
    };
  }

  // Time series: a time column plus measures.
  if (time && nums.length >= 1 && intent !== 'relationship') {
    const sorted = rows.every((r) => typeof r[time.key] === 'string' && ISO.test(String(r[time.key])))
      ? [...rows].sort((a, b) => String(a[time.key]).localeCompare(String(b[time.key])))
      : rows;
    const sortedCols = analyze(sorted);
    const measures = sortedCols.filter((c) => c.kind === 'number');
    const group = cats.find((c) => c.distinct >= 2 && c.distinct <= 8);

    // Long format (date, group, value) → one series per group.
    if (group && measures.length === 1) {
      const xs = [...new Set(sorted.map((r) => String(r[time.key])))];
      const groups = [...new Set(sorted.map((r) => String(r[group.key])))];
      const series = groups.map((g) => ({
        name: g,
        values: xs.map((x) => {
          const hit = sorted.find((r) => String(r[time.key]) === x && String(r[group.key]) === g);
          return hit ? toNumber(hit[measures[0]!.key]) : null;
        }),
      }));
      return {
        template: 'line_chart',
        data: { x: formatTimeLabels(xs), series, format: measures[0]!.format },
        reason: `${measures[0]!.label.toLowerCase()} over time, one line per ${group.label.toLowerCase()}`,
      };
    }

    const x = formatTimeLabels(sorted.map((r) => String(r[time.key])));
    const used = measures.slice(0, 8);
    if (used.length >= 2 && !similarScale(used)) {
      // Different scales never share an axis: one small chart per measure.
      return {
        template: 'dashboard',
        data: {
          title,
          columns: used.length >= 3 ? 2 : used.length,
          blocks: used.slice(0, 4).map((c) => ({
            template: 'line_chart',
            data: { title: c.label, x, series: [{ name: c.label, values: clean(c.nums) }], format: c.format, height: 200 },
          })),
        },
        reason: `${used.length} measures on very different scales, so each gets its own chart instead of sharing an axis`,
      };
    }
    if (intent === 'compare' && rows.length <= 12) {
      return {
        template: 'bar_chart',
        data: { categories: x, series: used.map((c) => ({ name: c.label, values: clean(c.nums) })), format: used[0]!.format },
        reason: 'comparing a few periods side by side',
      };
    }
    return {
      template: 'line_chart',
      data: { x, series: used.map((c) => ({ name: c.label, values: clean(c.nums) })), format: used[0]!.format, area: used.length === 1 && rows.length >= 20 },
      reason: `${used.length === 1 ? used[0]!.label.toLowerCase() : `${used.length} measures`} over ${rows.length} time points`,
    };
  }

  const label = cats.find((c) => c.distinct >= rows.length * 0.8) ?? cats[0];

  // Two measures without time → relationship.
  if (nums.length >= 2 && (intent === 'relationship' || (!label && rows.length >= 8) || (rows.length >= 15 && nums.length === 2 && intent !== 'compare'))) {
    const [xc, yc] = nums as [Column, Column];
    const points = rows.map((r, i) => ({
      x: xc.nums[i],
      y: yc.nums[i],
      ...(label && rows.length <= 12 ? { label: String(r[label.key]) } : {}),
    })).filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
    return {
      template: 'scatter_chart',
      data: { series: [{ name: `${yc.label} vs ${xc.label}`, points }], x_label: xc.label, y_label: yc.label, x_format: xc.format, y_format: yc.format },
      reason: `relationship between ${xc.label.toLowerCase()} and ${yc.label.toLowerCase()}`,
    };
  }

  if (label && nums.length >= 1) {
    const categories = rows.map((r) => String(r[label.key] ?? ''));
    if (nums.length === 1) {
      const values = nums[0]!.nums;
      const whole = sumsToWhole(values);
      if ((intent === 'share' || (whole && intent !== 'compare')) && rows.length <= 12 && values.every((v) => v >= 0)) {
        return {
          template: 'pie_chart',
          data: pieData(categories, values, nums[0]!.format),
          reason: whole ? 'values add up to a whole' : 'part-to-whole breakdown',
        };
      }
      if (rows.length <= 4 && intent !== 'compare') {
        return {
          template: 'stats',
          data: { items: categories.map((c, i) => ({ label: c, value: values[i] ?? 0, format: nums[0]!.format })) },
          reason: 'only a few values, so headline numbers beat a chart',
        };
      }
      // Long rankings keep the top 20; the rest wouldn't be readable as bars anyway.
      const ranked = categories.map((c, i) => [c, values[i]!] as const).filter(([, v]) => Number.isFinite(v));
      if (ranked.length > 30) ranked.sort((a, b) => b[1] - a[1]).splice(20);
      return {
        template: 'bar_chart',
        data: {
          categories: ranked.map(([c]) => c),
          series: [{ name: nums[0]!.label, values: ranked.map(([, v]) => v) }],
          format: nums[0]!.format,
          sort: intent === 'trend' ? 'none' : 'desc',
          ...(ranked.length < rows.length ? { subtitle: `Top ${ranked.length} of ${rows.length}` } : {}),
        },
        reason: `${nums[0]!.label.toLowerCase()} across ${rows.length} ${label.label.toLowerCase()} values, ranked`,
      };
    }
    if (nums.length <= 8 && rows.length <= 15 && similarScale(nums) && cols.length <= nums.length + 2) {
      return {
        template: 'bar_chart',
        data: { categories, series: nums.map((c) => ({ name: c.label, values: clean(c.nums) })), format: nums[0]!.format },
        reason: `${nums.length} comparable measures across ${rows.length} categories`,
      };
    }
  }

  return tableChoice(rows, cols);
}

/** Everything else is a table, with an inline bar on the first measure. */
function tableChoice(rows: Row[], cols: Column[]): Choice {
  const firstNum = cols.find((c) => c.kind === 'number')?.key;
  return {
    template: 'table',
    data: {
      columns: cols.slice(0, 12).map((c) => ({ key: c.key, label: c.label, format: c.format, bar: c.key === firstNum && rows.length >= 3 ? true : undefined })),
      rows: rows.slice(0, 500).map((r) => Object.fromEntries(cols.slice(0, 12).map((c) => [c.key, normalizeCell(r[c.key], c.kind)]))),
    },
    reason: `${rows.length} rows × ${cols.length} columns of mixed data`,
  };
}

function normalizeCell(v: unknown, kind: Kind): string | number | boolean | null {
  if (v == null) return null;
  if (kind === 'number') return toNumber(v);
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return v;
  return JSON.stringify(v).slice(0, 120);
}

function fromRecord(rec: Row, intent: Intent | undefined, title?: string): Choice {
  const entries = Object.entries(rec);
  const numeric = entries.map(([k, v]) => [k, toNumber(v)] as const);
  const allNumbers = entries.length > 0 && numeric.every(([, n]) => n != null);

  if (allNumbers) {
    const labels = entries.map(([k]) => humanize(k));
    const values = numeric.map(([, n]) => n!);
    const formats = entries.map(([k, v]) => inferFormat(k, [v], [toNumber(v)!]));
    if (entries.length === 1) {
      return { template: 'stats', data: { items: [{ label: title ?? labels[0], value: values[0], format: formats[0] }] }, reason: 'a single number' };
    }
    if ((intent === 'share' || (sumsToWhole(values) && intent !== 'compare')) && values.every((v) => v >= 0) && entries.length <= 12) {
      return { template: 'pie_chart', data: pieData(labels, values), reason: 'parts of a whole' };
    }
    if (entries.length <= 4 && intent !== 'compare') {
      return {
        template: 'stats',
        data: { items: labels.map((l, i) => ({ label: l, value: values[i], format: formats[i] })) },
        reason: 'a few named numbers read best as stat tiles',
      };
    }
    return {
      template: 'bar_chart',
      data: { categories: labels, series: [{ name: title ?? 'Value', values }], sort: 'desc' },
      reason: `${entries.length} named values, ranked`,
    };
  }

  // { name: [numbers…], … } with equal lengths → series.
  const arrays = entries.filter(([, v]) => Array.isArray(v) && v.every((n) => toNumber(n) != null));
  if (arrays.length === entries.length && arrays.length >= 1) {
    const len = (arrays[0]![1] as unknown[]).length;
    if (len >= 2 && arrays.every(([, v]) => (v as unknown[]).length === len) && arrays.length <= 8) {
      return {
        template: 'line_chart',
        data: { x: Array.from({ length: len }, (_, i) => String(i + 1)), series: arrays.map(([k, v]) => ({ name: humanize(k), values: (v as unknown[]).map(toNumber) })) },
        reason: 'named number sequences of equal length',
      };
    }
  }

  // { group: { metric: n, … }, … } → rows keyed by group.
  if (entries.length >= 2 && entries.every(([, v]) => v && typeof v === 'object' && !Array.isArray(v))) {
    return fromRows(entries.map(([k, v]) => ({ name: k, ...(v as Row) })), intent, title);
  }

  return {
    template: 'key_value',
    data: {
      items: entries.slice(0, 40).map(([k, v]) => ({
        label: humanize(k),
        value: v == null || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' ? (typeof v === 'string' ? v.slice(0, 200) : v) : JSON.stringify(v).slice(0, 200),
        format: typeof v === 'number' ? inferFormat(k, [v], [v]) : undefined,
      })),
    },
    reason: 'a record of labelled values',
  };
}

function fromArray(arr: unknown[], intent: Intent | undefined, title?: string): Choice {
  if (arr.length === 0) throw new Error('Nothing to visualize: the data is an empty list.');
  const nums = arr.map(toNumber);
  if (nums.every((n) => n != null)) {
    const values = nums as number[];
    const label = title ?? 'Value';
    if (values.length === 1) return { template: 'stats', data: { items: [{ label, value: values[0] }] }, reason: 'a single number' };
    if (values.length === 2) {
      const [prev, cur] = values as [number, number];
      return {
        template: 'stats',
        data: { items: [{ label, value: cur, ...(prev ? { delta: Math.round(((cur - prev) / Math.abs(prev)) * 1000) / 10, delta_label: `vs ${prev.toLocaleString('en-US')}` } : {}) }] },
        reason: 'two numbers read as a current value and its change',
      };
    }
    if (intent === 'compare' || (intent !== 'trend' && values.length <= 6)) {
      return {
        template: 'bar_chart',
        data: { categories: values.map((_, i) => `#${i + 1}`), series: [{ name: label, values }] },
        reason: 'a short list of values to compare',
      };
    }
    return {
      template: 'line_chart',
      data: { x: values.map((_, i) => String(i + 1)), series: [{ name: label, values }], area: values.length >= 20 },
      reason: `a sequence of ${values.length} values`,
    };
  }
  if (arr.every((v) => typeof v === 'string')) {
    const items = arr as string[];
    if (items.length >= 6 && items.every((s) => s.length <= 24 && s.split(/\s+/).length <= 3)) {
      return { template: 'tags', data: { tags: items.slice(0, 120) }, reason: 'many short labels read as tags' };
    }
    return { template: 'list', data: { items: items.slice(0, 60).map((text) => ({ text: text.slice(0, 400) })) }, reason: 'a list of items' };
  }
  if (arr.every((v) => v && typeof v === 'object' && !Array.isArray(v))) return fromRows(arr as Row[], intent, title);
  if (arr.every(Array.isArray)) {
    const [head, ...rest] = arr as unknown[][];
    if (head!.every((h) => typeof h === 'string') && rest.length) {
      return fromRows(rest.map((r) => Object.fromEntries(head!.map((h, i) => [h as string, r[i]]))), intent, title);
    }
    return fromRows(
      (arr as unknown[][]).map((r) => Object.fromEntries(r.map((v, i) => [`Column ${i + 1}`, v]))),
      intent,
      title,
    );
  }
  return { template: 'list', data: { items: arr.slice(0, 60).map((v) => ({ text: String(typeof v === 'object' ? JSON.stringify(v) : v).slice(0, 400) })) }, reason: 'a list of mixed items' };
}

/** Data that already matches a template's shape is used as-is. */
const SIGNATURES: Array<[string, string[]]> = [
  ['diff', ['before', 'after']],
  ['diff', ['patch']],
  ['steps', ['steps']],
  ['math', ['expressions']],
  ['status_page', ['services']],
  ['month_calendar', ['month', 'events']],
  ['map', ['markers']],
  ['task_board', ['columns']],
  ['world_clock', ['cities']],
  ['alarm', ['alarms']],
  ['sports_score', ['home', 'away']],
  ['activity', ['rings']],
  ['occasion', ['occasion']],
  ['watchlist', ['quotes']],
  ['stock_quote', ['symbol', 'price']],
  ['smart_home', ['devices']],
  ['bar_chart', ['categories', 'series']],
  ['line_chart', ['x', 'series']],
  ['pie_chart', ['slices']],
  ['sankey', ['links']],
  ['candlestick', ['candles']],
  ['funnel', ['stages']],
  ['dashboard', ['blocks']],
  ['heatmap', ['x', 'y', 'values']],
  ['markdown', ['markdown']],
  ['code', ['code']],
  ['chat', ['messages']],
  ['quote', ['quote']],
  ['agenda', ['events']],
  ['timeline', ['events']],
  ['table', ['rows']],
];

// --- hints -----------------------------------------------------------------------

/** Words and units around the data: the title, subtitle, keys and value suffixes. */
interface Hints {
  /** Title and subtitle, lower case. */
  text: string;
  /** Record keys, or the keys of the rows. */
  keys: string[];
  percent: boolean;
  fahrenheit: boolean;
  celsius: boolean;
}

const isRow = (v: unknown): v is Row => !!v && typeof v === 'object' && !Array.isArray(v);

function hintsOf(input: VisualizeInput, data: unknown): Hints {
  const keys = new Set<string>();
  const values: unknown[] = [];
  const add = (r: Row) => {
    for (const [k, v] of Object.entries(r)) {
      keys.add(k);
      values.push(v);
    }
  };
  if (Array.isArray(data)) for (const v of data.slice(0, 100)) isRow(v) ? add(v) : values.push(v);
  else if (isRow(data)) add(data);
  else values.push(data);
  const strings = values.filter((v): v is string => typeof v === 'string');
  const text = `${input.title ?? ''} ${input.subtitle ?? ''}`.toLowerCase();
  return {
    text,
    keys: [...keys],
    percent: strings.some((s) => /\d\s*%\s*$/.test(s)),
    fahrenheit: strings.some((s) => /\d\s*°\s*f\b/i.test(s)) || /°\s*f\b|fahrenheit/i.test(text) || [...keys].some((k) => /^temp(erature)?[ _-]?f$/i.test(k)),
    celsius: strings.some((s) => /\d\s*°\s*c\b/i.test(s)) || /°\s*c\b|celsius/i.test(text) || [...keys].some((k) => /^temp(erature)?[ _-]?c$/i.test(k)),
  };
}

const keyOf = (keys: string[], re: RegExp) => keys.find((k) => re.test(k));
const round1 = (n: number) => Math.round(n * 10) / 10;

/** "65°F", "18 °C", 65 → a number. */
function degrees(v: unknown): number | null {
  if (typeof v === 'string') return toNumber(v.replace(/\s*°\s*[fc]?\s*$|\s*deg(rees)?\s*[fc]?\s*$/i, ''));
  return toNumber(v);
}

/** Rows from an array of objects, or from a header row followed by value rows. */
function rowsOf(data: unknown): Row[] | null {
  if (!Array.isArray(data) || !data.length) return null;
  if (data.every(isRow)) return data as Row[];
  if (data.every(Array.isArray)) {
    const [head, ...rest] = data as unknown[][];
    if (head!.every((h) => typeof h === 'string') && rest.length) return rest.map((r) => Object.fromEntries(head!.map((h, i) => [h as string, r[i]])));
  }
  return null;
}

/** One number: a number, numeric text, a one-entry record or a one-item list. */
function singleNumber(data: unknown): { value: number; key?: string; raw: unknown } | null {
  if (Array.isArray(data) && data.length === 1) return singleNumber(data[0]);
  if (isRow(data)) {
    const entries = Object.entries(data);
    if (entries.length !== 1) return null;
    const one = singleNumber(entries[0]![1]);
    return one && { ...one, key: entries[0]![0] };
  }
  const value = toNumber(data);
  return value == null ? null : { value, raw: data };
}

/** What a template builder returns: data for the template and the evidence in a few words. */
interface Built {
  data: Row;
  reason: string;
}

/**
 * Builds data for one template from raw data. `loose` is set when the caller
 * forced the template: shape alone is enough. Otherwise a builder fires only on
 * strong evidence (an unmistakable key set, or two independent hints).
 */
type Builder = (data: unknown, input: VisualizeInput, h: Hints, loose: boolean) => Built | null;

// Weather -------------------------------------------------------------------------

const TEMP_KEY = /^(temp|temperature)([ _-]?(f|c|deg|degrees))?$/i;
const HOUR_KEY = /^(hour|time|hr)$/i;
const DAY_KEY = /^(day|date|weekday|dow)$/i;
const HIGH_KEY = /^(high|hi|max|(temp|temperature)[ _-]?(max|high)|(max|high)[ _-]?(temp|temperature))([ _-]?[fc])?$/i;
const LOW_KEY = /^(low|lo|min|(temp|temperature)[ _-]?(min|low)|(min|low)[ _-]?(temp|temperature))([ _-]?[fc])?$/i;
const CONDITION_KEY = /^(condition|conditions|weather|sky|summary|icon|description|desc|forecast)$/i;
const RAIN_KEY = /^(rain|precip|precipitation|pop|chance|rain[ _-]?chance|precip(itation)?[ _-]?(chance|prob|probability))([ _-]?(pct|percent))?$/i;
const HUMIDITY_KEY = /^(humidity|rh)$/i;
const WIND_KEY = /^(wind|wind[ _-]?speed)$/i;
const FEELS_KEY = /^feels[ _-]?like$/i;
const WEATHER_WORDS = /forecast|weather|hourly|humid|wind|rain|precip|sunny|cloud|snow/;
const NOT_WEATHER = /cpu|gpu|disk|core|chip|battery|engine|oven|fridge|freezer|server|device|sensor|machine/;
/** "6am", "14:00", "Now": an hour label rather than a timestamp. */
const HOUR_LABEL = /^(now|\d{1,2}(:\d{2})?\s*(am|pm|a|p)?)$/i;

function weatherCondition(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const s = v.toLowerCase();
  const rules: Array<[RegExp, string]> = [
    [/thunder|storm|lightning/, 'thunderstorm'],
    [/hail/, 'hail'],
    [/sleet|freezing rain/, 'sleet'],
    [/snow|flurr|blizzard/, 'snow'],
    [/drizzle/, 'drizzle'],
    [/shower/, 'showers'],
    [/rain/, 'rain'],
    [/fog|mist|haze/, 'fog'],
    [/overcast/, 'overcast'],
    [/partly|mostly sunny|some clouds|few clouds|scattered clouds/, 'partly_cloudy'],
    [/cloud/, 'cloudy'],
    [/wind|breez|gust/, 'windy'],
    [/clear|sun|fair/, 'clear'],
  ];
  return rules.find(([re]) => re.test(s))?.[1];
}

const percentOf = (n: number | null, all: Array<number | null>) => (n == null ? undefined : Math.max(0, Math.min(100, Math.round(all.every((x) => x == null || x <= 1) ? n * 100 : n))));

/** "2026-10-29T06:00" → "06:00", anything else as given (max 10 characters). */
function hourLabel(v: unknown): string {
  const s = String(v ?? '').trim();
  const m = /^\d{4}-\d{2}-\d{2}[T ](\d{2}:\d{2})/.exec(s);
  return (m ? m[1]! : s).slice(0, 10);
}

/** "2026-10-29" → "Thu", anything else as given (max 20 characters). */
function dayLabel(v: unknown): string {
  const s = String(v ?? '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = new Date(`${s}T00:00:00Z`);
    if (!Number.isNaN(d.getTime())) return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()]!;
  }
  return s.slice(0, 20);
}

function weatherUnits(h: Hints, temps: number[]): 'metric' | 'imperial' {
  if (h.fahrenheit) return 'imperial';
  if (h.celsius) return 'metric';
  // Above 45° is a heat record in Celsius but an ordinary day in Fahrenheit.
  return Math.max(...temps) > 45 ? 'imperial' : 'metric';
}

const weatherBase = (input: VisualizeInput) => ({
  location: (input.title ?? 'Forecast').slice(0, 80),
  ...(input.subtitle ? { date: input.subtitle.slice(0, 60) } : {}),
});

function currentFrom(r: Row, keys: string[], temperature: number): Row {
  const num = (re: RegExp) => {
    const k = keyOf(keys, re);
    return k ? degrees(r[k]) ?? undefined : undefined;
  };
  const condK = keyOf(keys, CONDITION_KEY);
  const humidity = num(HUMIDITY_KEY);
  const wind = num(WIND_KEY);
  return {
    temperature: Math.round(temperature),
    condition: (condK && weatherCondition(r[condK])) || 'partly_cloudy',
    feels_like: num(FEELS_KEY),
    humidity: humidity != null && humidity >= 0 && humidity <= 100 ? Math.round(humidity <= 1 ? humidity * 100 : humidity) : undefined,
    wind_speed: wind != null && wind >= 0 ? wind : undefined,
  };
}

const weatherBuilder: Builder = (data, input, h, loose) => {
  const rows = rowsOf(data);
  if (rows) {
    const keys = h.keys;
    if (keys.some((k) => /^(open|close)$/i.test(k))) return null; // price candles, not weather
    const tempK = keyOf(keys, TEMP_KEY);
    const hourK = keyOf(keys, HOUR_KEY);
    const dayK = keyOf(keys, DAY_KEY);
    const hiK = keyOf(keys, HIGH_KEY);
    const loK = keyOf(keys, LOW_KEY);
    const condK = keyOf(keys, CONDITION_KEY);
    const rainK = keyOf(keys, RAIN_KEY);
    const rain = rows.map((r) => (rainK ? toNumber(r[rainK]) : null));
    const cond = (r: Row) => (condK ? weatherCondition(r[condK]) : undefined) ?? 'partly_cloudy';
    // Daily: a day plus high and low temperatures.
    if (dayK && hiK && loK && rows.length <= 14) {
      const hi = rows.map((r) => degrees(r[hiK]));
      const lo = rows.map((r) => degrees(r[loK]));
      if (hi.some((n) => n == null) || lo.some((n) => n == null)) return null;
      const daily = rows.map((r, i) => ({ day: dayLabel(r[dayK]), condition: cond(r), high: Math.round(hi[i]!), low: Math.round(lo[i]!), precipitation_chance: percentOf(rain[i]!, rain) }));
      const first = rows[0]!;
      return {
        data: {
          ...weatherBase(input),
          units: weatherUnits(h, hi as number[]),
          current: { ...currentFrom(first, keys, tempK ? degrees(first[tempK]) ?? hi[0]! : hi[0]!), high: daily[0]!.high, low: daily[0]!.low },
          daily,
        },
        reason: `${rows.length} days with ${dayK}, ${hiK} and ${loK} read as a daily forecast`,
      };
    }
    // Hourly: an hour plus a temperature, with an hour label or another weather hint.
    if (tempK && hourK && rows.length <= 24) {
      const temps = rows.map((r) => degrees(r[tempK]));
      if (temps.some((n) => n == null)) return null;
      const labels = rows.every((r) => HOUR_LABEL.test(String(r[hourK] ?? '').trim()));
      const other = [condK, rainK, keyOf(keys, HUMIDITY_KEY), keyOf(keys, WIND_KEY)].find(Boolean);
      const words = WEATHER_WORDS.test(h.text) || h.fahrenheit || h.celsius;
      const evidence = labels ? `${hourK} labels` : other ? `a ${other} column` : words ? 'the title' : '';
      if (!loose && (!evidence || NOT_WEATHER.test(h.text))) return null;
      const hourly = rows.map((r, i) => ({ time: hourLabel(r[hourK]), temperature: Math.round(temps[i]!), condition: cond(r), precipitation_chance: percentOf(rain[i]!, rain) }));
      return {
        data: { ...weatherBase(input), units: weatherUnits(h, temps as number[]), current: currentFrom(rows[0]!, keys, temps[0]!), hourly },
        reason: `${rows.length} rows of ${hourK} and ${tempK}${evidence ? ` with ${evidence}` : ''} read as an hourly forecast`,
      };
    }
    return null;
  }
  if (isRow(data)) {
    // Current conditions: a temperature plus another weather reading.
    const keys = Object.keys(data);
    const tempK = keyOf(keys, TEMP_KEY);
    const t = tempK ? degrees(data[tempK]) : null;
    const other = keyOf(keys, new RegExp(`${HUMIDITY_KEY.source}|${WIND_KEY.source}|${CONDITION_KEY.source}|${FEELS_KEY.source}|${RAIN_KEY.source}`, 'i'));
    if (t == null || (!other && !loose)) return null;
    const hiK = keyOf(keys, HIGH_KEY);
    const loK = keyOf(keys, LOW_KEY);
    return {
      data: {
        ...weatherBase(input),
        units: weatherUnits(h, [t]),
        current: { ...currentFrom(data, keys, t), high: hiK ? degrees(data[hiK]) ?? undefined : undefined, low: loK ? degrees(data[loK]) ?? undefined : undefined },
      },
      reason: `${tempK}${other ? ` and ${other}` : ''} read as current weather`,
    };
  }
  // A lone temperature with a weather title.
  const t = typeof data === 'number' || typeof data === 'string' ? degrees(data) : null;
  if (t == null || (!loose && (!/\btemp|temperature|weather|outside|outdoors?\b/.test(h.text) || NOT_WEATHER.test(h.text)))) return null;
  return {
    data: { ...weatherBase(input), units: weatherUnits(h, [t]), current: { temperature: Math.round(t), condition: 'partly_cloudy' } },
    reason: `a single temperature with a weather title`,
  };
};

// Gauge ---------------------------------------------------------------------------

const GAUGE_WORDS = /usage|utili[sz]ation|battery|load|progress|health|score|cpu|memory|\bram\b|disk|storage|capacity|charge|occupancy|completion|quota/;
/** Readings where a high value is bad, so the gauge gets warning and critical zones. */
const HIGHER_IS_WORSE = /usage|utili[sz]ation|load|cpu|memory|\bram\b|disk|storage|temp/;

const gaugeBuilder: Builder = (data, input, h, loose) => {
  const one = singleNumber(data);
  if (!one) return null;
  const word = (h.text.match(GAUGE_WORDS) ?? (one.key ? humanize(one.key).toLowerCase().match(GAUGE_WORDS) : null))?.[0];
  const pct = typeof one.raw === 'string' && /%\s*$/.test(one.raw);
  const fraction = !pct && one.value >= 0 && one.value <= 1 && !Number.isInteger(one.value);
  const inRange = one.value >= 0 && one.value <= 100;
  if (!loose && (!word || !(pct || inRange))) return null;
  const value = fraction ? round1(one.value * 100) : one.value;
  const max = value <= 100 ? 100 : 10 ** Math.ceil(Math.log10(value));
  const percent = pct || fraction || (max === 100 && !!word && !/score|health/.test(word));
  const worse = HIGHER_IS_WORSE.test(`${h.text} ${one.key ?? ''}`.toLowerCase());
  return {
    data: {
      value,
      min: 0,
      max,
      ...(one.key ? { label: humanize(one.key).slice(0, 60) } : {}),
      ...(percent ? { format: { suffix: '%' } } : {}),
      ...(worse && max === 100
        ? { thresholds: [{ from: 0, status: 'good' }, { from: 70, status: 'warning' }, { from: 90, status: 'critical' }] }
        : {}),
    },
    reason: word
      ? `“${word}” with ${pct ? 'a % value' : fraction ? 'a fraction' : 'a value from 0 to 100'} reads as a gauge${worse ? ', higher is worse' : ''}`
      : 'a single value on a 0 to 100 scale',
  };
};

// Countdown -----------------------------------------------------------------------

const COUNTDOWN_WORDS = /count ?down|until|\btill\b|remaining|time left|\bleft\b|\bends?\b|ending|due in|starts? in|launch|deadline/;
const DEADLINE_KEY = /^(target|deadline|due|due[ _-]?(date|at)|ends?([ _-]?at)?|until|starts?[ _-]?at|launch([ _-]?(date|at))?)$/i;
const WHEN_KEY = /^(date|when|at|time)$/i;
const UNIT_KEYS = ['days', 'hours', 'minutes', 'seconds'];

/** An ISO date or date-time in the future (relative to now). */
function futureDate(v: unknown): string | null {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(v.trim()) || v.trim().length > 40) return null;
  const t = Date.parse(v.trim());
  return Number.isFinite(t) && t > Date.now() ? v.trim() : null;
}

const countdownBuilder: Builder = (data, input, h, loose) => {
  const phrase = h.text.match(COUNTDOWN_WORDS)?.[0];
  const label = input.title?.slice(0, 80);
  const caption = input.subtitle?.slice(0, 160);
  const target = futureDate(data);
  if (target) {
    if (!phrase && !loose) return null;
    return { data: { label, target, caption }, reason: phrase ? `a future date with “${phrase}” in the title` : 'a future date' };
  }
  if (!isRow(data)) return null;
  const keys = Object.keys(data);
  const name = keyOf(keys, /^(name|label|event|title)$/i);
  const strong = keyOf(keys, DEADLINE_KEY);
  const when = strong ?? keyOf(keys, WHEN_KEY);
  const date = when ? futureDate(data[when]) : null;
  if (date && (strong || phrase || loose)) {
    return {
      data: { label: label ?? (name ? String(data[name]).slice(0, 80) : undefined), target: date, caption },
      reason: strong ? `a future ${strong} date` : `a future ${when} with “${phrase ?? 'countdown'}”`,
    };
  }
  const units = keys.filter((k) => UNIT_KEYS.includes(k.toLowerCase()));
  if (units.length && units.length === keys.length && units.every((k) => Number.isInteger(toNumber(data[k])) && toNumber(data[k])! >= 0) && (phrase || loose)) {
    return {
      data: { label, caption, ...Object.fromEntries(units.map((k) => [k.toLowerCase(), toNumber(data[k])])), units: UNIT_KEYS.filter((u) => units.some((k) => k.toLowerCase() === u)) },
      reason: `${units.join('/')} with “${phrase ?? 'countdown'}” in the title`,
    };
  }
  return null;
};

// Progress ------------------------------------------------------------------------

const PROGRESS_VALUE_KEY = /^(value|current|done|progress|completed?|count|actual|raised|saved|so[ _-]?far|achieved)$/i;
const PROGRESS_MAX_KEY = /^(max|goal|target|total|of|limit|quota|out[ _-]?of)$/i;
const PROGRESS_WORDS = /progress|goal|target|quota|complet/;

const progressBuilder: Builder = (data, input, h, loose) => {
  const rows = rowsOf(data);
  const words = PROGRESS_WORDS.test(h.text);
  if (rows) {
    if (rows.length > 24) return null;
    const cols = analyze(rows);
    const label = cols.find((c) => c.kind === 'category');
    const maxC = cols.find((c) => c.kind === 'number' && PROGRESS_MAX_KEY.test(c.key));
    const valueC = cols.find((c) => c.kind === 'number' && c !== maxC && PROGRESS_VALUE_KEY.test(c.key)) ?? ((words || loose) ? cols.find((c) => c.kind === 'number' && c !== maxC) : undefined);
    if (!label || !valueC || (!maxC && !loose)) return null;
    const items = rows.map((r, i) => ({ label: String(r[label.key] ?? '').slice(0, 100) || '—', value: valueC.nums[i]!, max: maxC ? maxC.nums[i]! : 100 }));
    if (items.some((it) => !Number.isFinite(it.value) || !(it.max > 0))) return null;
    return { data: { items }, reason: `${valueC.key} out of ${maxC?.key ?? '100'} per ${label.key}` };
  }
  if (isRow(data)) {
    const keys = Object.keys(data);
    const maxK = keys.find((k) => PROGRESS_MAX_KEY.test(k) && toNumber(data[k]) != null);
    const valueK = keys.find((k) => k !== maxK && PROGRESS_VALUE_KEY.test(k) && toNumber(data[k]) != null);
    const labelK = keyOf(keys, /^(label|name|title)$/i);
    if (!maxK || !valueK || keys.length > (labelK ? 3 : 2)) return null;
    const max = toNumber(data[maxK])!;
    if (!(max > 0)) return null;
    const item = { label: (labelK ? String(data[labelK]) : input.title ?? 'Progress').slice(0, 100), value: toNumber(data[valueK])!, max };
    return { data: { items: [item] }, reason: `${valueK} out of ${maxK}` };
  }
  const one = loose ? singleNumber(data) : null;
  if (!one) return null;
  const value = one.value >= 0 && one.value <= 1 && !Number.isInteger(one.value) ? round1(one.value * 100) : one.value;
  return { data: { items: [{ label: (input.title ?? (one.key ? humanize(one.key) : 'Progress')).slice(0, 100), value, max: 100 }] }, reason: 'a single value as a percentage' };
};

// Checklists ----------------------------------------------------------------------

const TASK_TEXT_KEY = /^(text|title|task|name|item|todo|label|description|summary)$/i;
const TASK_STATUS_KEY = /^(done|completed?|checked|status|state|finished|is[ _-]?done|is[ _-]?completed)$/i;
const TASK_META_KEY = /^(due|due[ _-]?date|date|when|owner|assignee|deadline)$/i;

function taskStatus(v: unknown): string | undefined {
  if (typeof v === 'boolean') return v ? 'done' : 'todo';
  if (typeof v !== 'string') return undefined;
  const s = v.trim().toLowerCase().replace(/[_-]+/g, ' ');
  if (/^(done|complete|completed|finished|closed|resolved|checked|yes|true)$/.test(s)) return 'done';
  if (/^(in progress|doing|started|wip|active|ongoing)$/.test(s)) return 'in_progress';
  if (/^(todo|to do|open|pending|not started|planned|new|no|false|unchecked)$/.test(s)) return 'todo';
  if (/^(blocked|stuck|waiting)$/.test(s)) return 'blocked';
  if (/^(skipped|cancell?ed|wont do|won't do)$/.test(s)) return 'skipped';
  return undefined;
}

/** Titles that make short strings a to-do list rather than tags. */
const TASK_WORDS = /\btasks?\b|to-?dos?|to do|checklist|reminders?|errands?|shopping|groceries|chores|agenda|\btoday\b/;

/** Strict: rows of task text plus a done flag or status, or short strings under a to-do title. */
const listBuilder: Builder = (data, input, h, loose) => {
  if (!loose && Array.isArray(data) && data.length >= 2 && data.length <= 60 && data.every((v) => typeof v === 'string' && v.trim()) && TASK_WORDS.test(h.text)) {
    const word = h.text.match(TASK_WORDS)![0];
    return { data: { items: (data as string[]).map((text) => ({ text: text.slice(0, 400) })) }, reason: `${data.length} items under a “${word}” title read as a list` };
  }
  const rows = rowsOf(data);
  if (rows && rows.length <= 60) {
    const keys = h.keys;
    const textK = keys.find((k) => TASK_TEXT_KEY.test(k) && rows.every((r) => typeof r[k] === 'string' && (r[k] as string).trim()));
    const statusK = keys.find((k) => TASK_STATUS_KEY.test(k) && rows.every((r) => taskStatus(r[k]) != null));
    const metaK = keyOf(keys, TASK_META_KEY);
    if (textK && statusK && (rows.length >= 2 || loose)) {
      const items = rows.map((r) => ({ text: String(r[textK]).slice(0, 400), status: taskStatus(r[statusK]), meta: metaK && r[metaK] != null ? String(r[metaK]).slice(0, 60) : undefined }));
      const done = items.filter((i) => i.status === 'done').length;
      return { data: { style: 'check', items }, reason: `${rows.length} tasks with ${textK} and ${statusK} (${done} done)` };
    }
  }
  return null;
};

// Clocks --------------------------------------------------------------------------

const ZONE = /^(utc|gmt|[a-z]+\/[a-z_+-]+(\/[a-z_+-]+)?)$/i;
const isZone = (v: unknown) => typeof v === 'string' && ZONE.test(v.trim());

const worldClockBuilder: Builder = (data) => {
  const rows = rowsOf(data);
  if (rows) {
    const keys = Object.keys(rows[0]!);
    const nameK = keyOf(keys, /^(city|name|label|location|place|office)$/i);
    const zoneK = keyOf(keys, /^(timezone|time[ _-]?zone|tz|zone)$/i);
    if (!nameK || !zoneK || rows.length > 16 || !rows.every((r) => isZone(r[zoneK]) && r[nameK] != null)) return null;
    return { data: { cities: rows.map((r) => ({ name: String(r[nameK]).slice(0, 60), timezone: String(r[zoneK]).trim() })) }, reason: `${rows.length} places with ${zoneK} names` };
  }
  if (isRow(data)) {
    const entries = Object.entries(data);
    if (entries.length < 2 || entries.length > 16 || !entries.every(([, v]) => isZone(v))) return null;
    return { data: { cities: entries.map(([k, v]) => ({ name: k.slice(0, 60), timezone: String(v).trim() })) }, reason: `${entries.length} places mapped to time zones` };
  }
  return null;
};

const clockBuilder: Builder = (data, input, h, loose) => {
  if (typeof data !== 'string') return null;
  const s = data.trim();
  const word = /\b(clock|time|now)\b/.test(h.text);
  if (isZone(s) && (word || loose)) return { data: { label: input.title?.slice(0, 80), timezone: s }, reason: `a time zone name${word ? ' with a clock title' : ''}` };
  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(s) && (word || loose)) return { data: { label: input.title?.slice(0, 80), time: s }, reason: `a time of day${word ? ' with a clock title' : ''}` };
  return null;
};

// Activity rings ------------------------------------------------------------------

const RING_WORDS = /move|exercise|stand|steps|calories|kcal|active|workout|ring|sleep|water|distance/;

const activityBuilder: Builder = (data, input, h, loose) => {
  const rings: Array<{ label: string; value: number; goal: number }> = [];
  const rows = rowsOf(data);
  if (rows) {
    const cols = analyze(rows);
    const label = cols.find((c) => c.kind === 'category');
    const goal = cols.find((c) => c.kind === 'number' && /^(goal|target)$/i.test(c.key));
    const value = cols.find((c) => c.kind === 'number' && c !== goal);
    if (!label || !goal || !value) return null;
    rows.forEach((r, i) => rings.push({ label: String(r[label.key]).slice(0, 30), value: value.nums[i]!, goal: goal.nums[i]! }));
  } else if (isRow(data)) {
    for (const [k, v] of Object.entries(data)) {
      if (isRow(v)) {
        const value = toNumber(v.value ?? v.current ?? v.done);
        const goal = toNumber(v.goal ?? v.target);
        if (value != null && goal != null) rings.push({ label: humanize(k).slice(0, 30), value, goal });
      } else if (!/goal|target$/i.test(k)) {
        const goalK = Object.keys(data).find((g) => g !== k && new RegExp(`^${k}[ _-]?(goal|target)$`, 'i').test(g));
        const value = toNumber(v);
        const goal = goalK ? toNumber(data[goalK]) : null;
        if (value != null && goal != null) rings.push({ label: humanize(k).slice(0, 30), value, goal });
      }
    }
  } else return null;
  const ringWords = RING_WORDS.test(h.text) || rings.some((r) => RING_WORDS.test(r.label.toLowerCase()));
  if (rings.length < 1 || rings.length > 4 || (!loose && (rings.length < 2 || !ringWords))) return null;
  if (rings.some((r) => !(r.value >= 0) || !(r.goal > 0))) return null;
  return { data: { rings }, reason: `${rings.length} values with goals (${rings.map((r) => r.label.toLowerCase()).join(', ')}) as activity rings` };
};

// Markets -------------------------------------------------------------------------

const candlestickBuilder: Builder = (data) => {
  const rows = rowsOf(data);
  if (!rows || rows.length < 2) return null;
  const keys = Object.keys(rows[0]!);
  const k = (re: RegExp) => keyOf(keys, re);
  const [o, hi, lo, c] = [k(/^(open|o)$/i), k(/^(high|h)$/i), k(/^(low|l)$/i), k(/^(close|c)$/i)];
  const date = k(TIME_NAME) ?? k(/^(date|time|day|period)$/i);
  const vol = k(/^(volume|vol|v)$/i);
  if (!o || !hi || !lo || !c || !date) return null;
  const candles = rows.map((r) => ({ date: String(r[date]).slice(0, 30), open: toNumber(r[o]), high: toNumber(r[hi]), low: toNumber(r[lo]), close: toNumber(r[c]), volume: vol ? toNumber(r[vol]) ?? undefined : undefined }));
  if (candles.some((x) => x.open == null || x.high == null || x.low == null || x.close == null)) return null;
  return { data: { candles }, reason: `${rows.length} rows of open/high/low/close prices` };
};

const stockQuoteBuilder: Builder = (data) => {
  if (!isRow(data)) return null;
  const keys = Object.keys(data);
  const sym = keyOf(keys, /^(symbol|ticker)$/i);
  const price = keyOf(keys, /^(price|last|last[ _-]?price|close|current)$/i);
  if (!sym || !price || typeof data[sym] !== 'string' || toNumber(data[price]) == null) return null;
  const num = (re: RegExp) => {
    const key = keyOf(keys, re);
    return key ? toNumber(data[key]) ?? undefined : undefined;
  };
  const name = keyOf(keys, /^(name|company)$/i);
  return {
    data: {
      symbol: String(data[sym]).toUpperCase().slice(0, 16),
      price: toNumber(data[price]),
      name: name ? String(data[name]).slice(0, 80) : undefined,
      change: num(/^(change|chg)$/i),
      change_percent: num(/^(change[ _-]?(percent|pct)|pct[ _-]?change|percent[ _-]?change)$/i),
      previous_close: num(/^(previous[ _-]?close|prev[ _-]?close)$/i),
    },
    reason: `${sym} with ${price} reads as a stock quote`,
  };
};

/** Builders tried before the shape rules, in order; each fires only on strong evidence. */
const HINTED: Array<[string, Builder]> = [
  ['activity', activityBuilder],
  ['candlestick', candlestickBuilder],
  ['stock_quote', stockQuoteBuilder],
  ['weather', weatherBuilder],
  ['gauge', gaugeBuilder],
  ['countdown', countdownBuilder],
  ['progress', progressBuilder],
  ['list', listBuilder],
  ['world_clock', worldClockBuilder],
  ['clock', clockBuilder],
];

/** Cleans a builder's data and keeps it only when the template accepts it. */
function accept(registry: Registry, template: string, built: Built | null): Choice | null {
  if (!built) return null;
  const data = JSON.parse(JSON.stringify(built.data)) as Row;
  return registry.get(template)?.schema.safeParse(data).success ? { template, data, reason: built.reason } : null;
}

function hintChoice(data: unknown, input: VisualizeInput, registry: Registry, exclude: string[]): Choice | null {
  const h = hintsOf(input, data);
  for (const [template, build] of HINTED) {
    if (exclude.includes(template)) continue;
    const choice = accept(registry, template, build(data, input, h, false));
    if (choice) return choice;
  }
  return null;
}

// --- forced templates ------------------------------------------------------------

/** A label column (text, else time) and the measures of some rows. */
function labelled(rows: Row[]) {
  const cols = analyze(rows);
  const cats = cols.filter((c) => c.kind === 'category');
  const label = cats.find((c) => c.distinct >= rows.length * 0.8) ?? cats[0] ?? cols.find((c) => c.kind === 'time');
  return { cols, label, nums: cols.filter((c) => c.kind === 'number' && c !== label) };
}

const scalar = (v: unknown) => (v == null || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' ? (typeof v === 'string' ? v.slice(0, 200) : v) : JSON.stringify(v).slice(0, 200));
const numberList = (data: unknown) => (Array.isArray(data) && data.length && data.every((v) => toNumber(v) != null) ? data.map((v) => toNumber(v)!) : null);
const numberRecord = (data: unknown) => {
  if (!isRow(data)) return null;
  const entries = Object.entries(data).map(([k, v]) => [k, toNumber(v)] as const);
  return entries.length && entries.every(([, n]) => n != null) ? (entries as Array<readonly [string, number]>) : null;
};

const looseList: Builder = (data, input, h, loose) => {
  const tasks = listBuilder(data, input, h, loose);
  if (tasks || !loose) return tasks;
  if (Array.isArray(data) && data.every((v) => typeof v === 'string' || typeof v === 'number')) {
    return { data: { items: data.slice(0, 60).map((v) => ({ text: String(v).slice(0, 400) || '—' })) }, reason: `${data.length} items` };
  }
  const rows = rowsOf(data);
  if (rows) {
    const { cols, label } = labelled(rows);
    if (!label) return null;
    const meta = cols.find((c) => c !== label);
    const items = rows.slice(0, 60).map((r) => ({ text: String(r[label.key] ?? '').slice(0, 400) || '—', meta: meta && r[meta.key] != null ? String(scalar(r[meta.key])).slice(0, 60) : undefined }));
    return { data: { items }, reason: `${label.label.toLowerCase()} per row${meta ? `, ${meta.label.toLowerCase()} on the right` : ''}` };
  }
  if (isRow(data)) {
    return { data: { items: Object.entries(data).slice(0, 60).map(([k, v]) => ({ text: humanize(k), meta: String(scalar(v)).slice(0, 60) })) }, reason: 'one item per key' };
  }
  return null;
};

const keyValue: Builder = (data) => {
  const rows = rowsOf(data);
  const rec = isRow(data) ? data : rows?.length === 1 ? rows[0]! : null;
  if (rec) {
    return {
      data: { items: Object.entries(rec).slice(0, 40).map(([k, v]) => ({ label: humanize(k).slice(0, 80) || '—', value: scalar(v), format: typeof v === 'number' ? inferFormat(k, [v], [v]) : undefined })) },
      reason: 'labelled values',
    };
  }
  if (!rows) return null;
  const { cols, label, nums } = labelled(rows);
  const value = nums[0] ?? cols.find((c) => c !== label);
  if (!label || !value) return null;
  return {
    data: { items: rows.slice(0, 40).map((r) => ({ label: String(r[label.key] ?? '').slice(0, 80) || '—', value: scalar(r[value.key]), format: value.format })) },
    reason: `${label.label.toLowerCase()} with ${value.label.toLowerCase()} per row`,
  };
};

const table: Builder = (data) => {
  const rows = rowsOf(data) ?? (Array.isArray(data) && data.length ? data.map((v) => ({ item: v })) : isRow(data) ? Object.entries(data).map(([k, v]) => ({ label: humanize(k), value: scalar(v) })) : null);
  if (!rows) return null;
  const choice = tableChoice(rows, analyze(rows));
  return { data: choice.data, reason: choice.reason };
};

const stats: Builder = (data, input) => {
  const one = singleNumber(data);
  if (one) return { data: { items: [{ label: (input.title ?? (one.key ? humanize(one.key) : 'Value')).slice(0, 80), value: one.value }] }, reason: 'a single number' };
  const rec = numberRecord(data);
  if (rec && rec.length <= 12) return { data: { items: rec.map(([k, n]) => ({ label: humanize(k).slice(0, 80), value: n, format: inferFormat(k, [n], [n]) })) }, reason: `${rec.length} named numbers` };
  const list = numberList(data);
  if (list && list.length <= 12) return { data: { items: list.map((n, i) => ({ label: `#${i + 1}`, value: n })) }, reason: `${list.length} numbers` };
  const rows = rowsOf(data);
  if (!rows || rows.length > 12) return null;
  const { label, nums } = labelled(rows);
  if (!label || !nums[0]) return null;
  return { data: { items: rows.map((r, i) => ({ label: String(r[label.key] ?? '').slice(0, 80) || '—', value: nums[0]!.nums[i] ?? 0, format: nums[0]!.format })) }, reason: `${nums[0].label.toLowerCase()} per ${label.label.toLowerCase()}` };
};

/** Categories with one or more number series, for bars and lines. */
function series(data: unknown, title?: string): { x: string[]; series: Array<{ name: string; values: Array<number | null> }>; format?: FormatSpec; reason: string } | null {
  const rec = numberRecord(data);
  if (rec) return { x: rec.map(([k]) => humanize(k)), series: [{ name: title ?? 'Value', values: rec.map(([, n]) => n) }], reason: `${rec.length} named values` };
  const list = numberList(data);
  if (list) return { x: list.map((_, i) => String(i + 1)), series: [{ name: title ?? 'Value', values: list }], reason: `${list.length} values` };
  if (isRow(data)) {
    const arrays = Object.entries(data).filter(([, v]) => Array.isArray(v) && v.every((n) => toNumber(n) != null));
    const len = (arrays[0]?.[1] as unknown[] | undefined)?.length ?? 0;
    if (!arrays.length || arrays.length > 8 || !arrays.every(([, v]) => (v as unknown[]).length === len)) return null;
    return { x: Array.from({ length: len }, (_, i) => String(i + 1)), series: arrays.map(([k, v]) => ({ name: humanize(k), values: (v as unknown[]).map(toNumber) })), reason: 'named number sequences' };
  }
  const rows = rowsOf(data);
  if (!rows) return null;
  const { label, nums } = labelled(rows);
  if (!label || !nums.length) return null;
  const used = nums.slice(0, 8);
  const x = label.kind === 'time' ? formatTimeLabels(rows.map((r) => String(r[label.key]))) : rows.map((r) => String(r[label.key] ?? ''));
  return { x, series: used.map((c) => ({ name: c.label, values: clean(c.nums) })), format: used[0]!.format, reason: `${used.map((c) => c.label.toLowerCase()).join(', ')} per ${label.label.toLowerCase()}` };
}

const barChart: Builder = (data, input) => {
  const s = series(data, input.title);
  return s && { data: { categories: s.x.slice(0, 100), series: s.series.map((x) => ({ ...x, values: x.values.slice(0, 100) })), format: s.format }, reason: s.reason };
};

const lineChart: Builder = (data, input) => {
  const s = series(data, input.title);
  return s && s.x.length >= 2 ? { data: { x: s.x, series: s.series, format: s.format }, reason: s.reason } : null;
};

const pieChart: Builder = (data) => {
  const rec = numberRecord(data);
  if (rec) return { data: pieData(rec.map(([k]) => humanize(k)), rec.map(([, n]) => n)), reason: `${rec.length} parts` };
  const rows = rowsOf(data);
  if (!rows) return null;
  const { label, nums } = labelled(rows);
  if (!label || !nums[0]) return null;
  return { data: pieData(rows.map((r) => String(r[label.key] ?? '').slice(0, 80) || '—'), nums[0].nums, nums[0].format), reason: `${nums[0].label.toLowerCase()} per ${label.label.toLowerCase()}` };
};

const tags: Builder = (data) => {
  if (Array.isArray(data) && data.length && data.every((v) => typeof v === 'string' || typeof v === 'number')) return { data: { tags: data.slice(0, 120).map(String) }, reason: `${data.length} labels` };
  const rows = rowsOf(data);
  const label = rows && labelled(rows).label;
  return rows && label ? { data: { tags: rows.slice(0, 120).map((r) => String(r[label.key] ?? '')) }, reason: `${label.label.toLowerCase()} per row` } : null;
};

/** Text, a list of strings as bullets, or a record as bold labels. */
function asText(data: unknown): string | null {
  if (typeof data === 'string' || typeof data === 'number' || typeof data === 'boolean') return String(data);
  if (Array.isArray(data) && data.every((v) => typeof v === 'string' || typeof v === 'number')) return data.map((v) => `- ${v}`).join('\n');
  if (isRow(data) && Object.values(data).every((v) => v == null || typeof v !== 'object')) return Object.entries(data).map(([k, v]) => `**${humanize(k)}:** ${v}`).join('\n');
  return null;
}

const textCard: Builder = (data) => {
  const text = asText(data);
  return text ? { data: { text: text.slice(0, 10_000) }, reason: 'text' } : null;
};

const markdown: Builder = (data, input) => {
  const text = asText(data);
  return text ? { data: { markdown: input.title ? `# ${input.title}\n\n${text}` : text }, reason: 'text' } : null;
};

const timeline: Builder = (data) => {
  const rows = rowsOf(data);
  if (!rows) return null;
  const cols = analyze(rows);
  const time = cols.find((c) => c.kind === 'time');
  const text = cols.find((c) => c.kind === 'category' && c !== time);
  if (!time || !text) return null;
  return { data: { events: rows.slice(0, 40).map((r) => ({ date: String(r[time.key] ?? '').slice(0, 40), title: String(r[text.key] ?? '').slice(0, 200) || '—' })) }, reason: `${text.label.toLowerCase()} by ${time.label.toLowerCase()}` };
};

/** Builders per template for a forced `template`: the hinted ones run loose, plus the common shapes. */
const ADAPTERS: Partial<Record<string, Builder>> = {
  ...Object.fromEntries(HINTED),
  list: looseList,
  key_value: keyValue,
  table,
  stats,
  bar_chart: barChart,
  line_chart: lineChart,
  pie_chart: pieChart,
  tags,
  text_card: textCard,
  markdown,
  timeline,
};

/** The caller's data can't be shaped for the template they forced. */
export class AdaptError extends Error {
  readonly template: string;
  constructor(template: string, detail: string) {
    super(`Can't turn this data into ${template}: ${detail}`);
    this.name = 'AdaptError';
    this.template = template;
  }
}

/**
 * Shapes the data for a template the caller chose: data already valid for it
 * is kept, else the template's adapter (or the automatic choice, when it lands
 * on the same template) builds it. Throws AdaptError when nothing fits.
 */
function adapt(template: string, input: VisualizeInput, registry: Registry): Choice {
  const t = registry.get(template);
  if (!t) throw new Error(`Unknown template "${template}". Available: ${registry.ids().join(', ')}`);
  const data = parseData(input.data);
  if (isRow(data) && t.schema.safeParse(data).success) return { template, data: { ...data }, reason: `the data already matches ${template}` };
  const build = ADAPTERS[template];
  const built = build ? accept(registry, template, build(data, input, hintsOf(input, data), true)) : null;
  if (built) return built;
  try {
    const auto = shapeChoice({ ...input, screen: undefined }, registry, { exclude: [] });
    if (auto.template === template) return auto;
  } catch {
    // fall through to the error
  }
  throw new AdaptError(template, build ? `the data doesn't have the shape ${template} needs` : `${template} has no adapter, so the data must already match its schema`);
}

// --- screen ---------------------------------------------------------------------

/** The screen a render will land on, from the effective render options (call, theme, server). */
export interface Screen {
  shape: 'rect' | 'circle';
  width?: number;
  height?: number;
  /** A fixed side of 600 px or less, or a round screen: dense layouts don't fit. */
  small: boolean;
}

export function screenFrom(opts: { width?: number; height?: number; shape?: string }): Screen {
  const shape = opts.shape === 'circle' ? 'circle' : 'rect';
  const small = shape === 'circle' || (opts.width != null && opts.width <= 600) || (opts.height != null && opts.height <= 600);
  return { shape, ...(opts.width != null ? { width: opts.width } : {}), ...(opts.height != null ? { height: opts.height } : {}), small };
}

export function describeScreen(s: Screen): string {
  const size = s.width || s.height ? `${s.width ?? 'auto'}×${s.height ?? 'auto'}` : 'template default size';
  return `${s.shape === 'circle' ? 'round' : 'rectangular'} ${size}${s.small ? ', small' : ''}`;
}

const screenName = (s: Screen) => (s.shape === 'circle' ? `${s.width ?? s.height ?? ''} px round screen`.trim() : `${s.width ?? 'auto'}×${s.height ?? 'auto'} screen`);

/** Row ids and ranks: numbers, but never the value worth showing. */
const ID_KEY = /^(id|#|no|num|index|idx|rank|row)$|[_ -]id$|[a-z]Id$/i;

/** Tables wider than this become label/value rows on a small screen. */
const SMALL_TABLE_COLUMNS = 3;

/**
 * On a small screen, swaps layouts that can't adapt (wide tables, multi-chart
 * dashboards) for ones that can. Not applied when the caller forced a template.
 */
function fitScreen(choice: Choice, screen: Screen, exclude: string[]): Choice {
  const where = screenName(screen);
  if (choice.template === 'table') {
    const rows = (choice.data.rows as Row[] | undefined) ?? [];
    const given = choice.data.columns as Array<{ key: string; label?: string; format?: FormatSpec }> | undefined;
    const keys = given?.map((c) => c.key) ?? analyze(rows).map((c) => c.key);
    if (keys.length <= SMALL_TABLE_COLUMNS || !rows.length) return choice;
    const cols = analyze(rows.map((r) => Object.fromEntries(keys.map((k) => [k, r[k]]))));
    const label = cols.find((c) => c.kind === 'category' && c.distinct >= rows.length * 0.8) ?? cols.find((c) => c.kind === 'category');
    const value = cols.find((c) => c.kind === 'number' && c !== label && !ID_KEY.test(c.key));
    const labelOf = (key: string) => given?.find((c) => c.key === key)?.label ?? humanize(key);
    if (label && value && !exclude.includes('key_value')) {
      return {
        template: 'key_value',
        data: {
          items: rows.slice(0, 40).map((r) => ({
            label: String(r[label.key] ?? '').slice(0, 80) || '—',
            value: (r[value.key] as never) ?? null,
            format: given?.find((c) => c.key === value.key)?.format ?? value.format,
          })),
        },
        reason: `${keys.length} columns are too wide for the ${where}, so ${labelOf(label.key).toLowerCase()} with ${labelOf(value.key).toLowerCase()} as label/value rows`,
      };
    }
    const keep = [label?.key, ...keys.filter((k) => k !== label?.key)].filter((k): k is string => !!k).slice(0, SMALL_TABLE_COLUMNS);
    return {
      template: 'table',
      data: {
        ...choice.data,
        columns: keep.map((k) => given?.find((c) => c.key === k) ?? { key: k, label: humanize(k) }),
        rows: rows.map((r) => Object.fromEntries(keep.map((k) => [k, r[k]]))),
      },
      reason: `${choice.reason}; kept ${keep.length} of ${keys.length} columns (${keep.map(labelOf).join(', ')}) for the ${where}`,
    };
  }
  if (choice.template === 'dashboard') {
    const blocks = (choice.data.blocks as Array<{ template: string; data: Row }> | undefined) ?? [];
    if (!blocks.length) return choice;
    // Charts of one measure each → the latest value of each as a stat tile.
    const charts = blocks.every((b) => (b.template === 'line_chart' || b.template === 'bar_chart') && Array.isArray(b.data.series) && (b.data.series as unknown[]).length === 1);
    if (charts && blocks.length <= 12 && !exclude.includes('stats')) {
      const items = blocks.map((b) => {
        const s = (b.data.series as Array<{ name: string; values: Array<number | null> }>)[0]!;
        const vals = s.values.filter((v): v is number => v != null && Number.isFinite(v));
        const last = vals[vals.length - 1] ?? 0;
        const prev = vals[vals.length - 2];
        return {
          label: String(b.data.title ?? s.name).slice(0, 80),
          value: last,
          format: b.data.format as FormatSpec | undefined,
          ...(prev ? { delta: Math.round(((last - prev) / Math.abs(prev)) * 1000) / 10 } : {}),
        };
      });
      return {
        template: 'stats',
        data: { ...(choice.data.title ? { title: choice.data.title } : {}), items },
        reason: `${blocks.length} charts don't fit the ${where}, so the latest value of each measure as stat tiles`,
      };
    }
    const first = blocks[0]!;
    if (exclude.includes(first.template)) return choice;
    return {
      template: first.template,
      data: { ...first.data },
      reason: `a ${blocks.length}-block dashboard doesn't fit the ${where}, so only its first block (${first.template})`,
    };
  }
  return choice;
}

/** Lists longer than this may be pre-cut on a small screen; shorter ones are left to overflow "cap". */
const PRECUT_OVER = 12;
const LIST_KEYS: Record<string, string> = { list: 'items', key_value: 'items', table: 'rows', timeline: 'events', progress: 'items' };

/** Rows a small screen of fixed height shows, generously: overflow "cap" still trims what doesn't fit. */
function rowsFor(screen: Screen, titled: boolean): number {
  const height = screen.height ?? 466;
  return Math.max(5, Math.round((height - (titled ? 110 : 60)) / (screen.shape === 'circle' ? 52 : 40)));
}

/**
 * On a small screen, keeps the most relevant part of long data so nothing
 * needs a crop: the first rows of long lists (given order), the top bars and
 * slices by value with the rest folded into "Other", the last points of long
 * lines. The total goes in the subtitle. Returns the note, if it cut anything.
 */
function trimForScreen(choice: Choice, screen: Screen): string | undefined {
  const d = choice.data;
  const listKey = LIST_KEYS[choice.template];
  const list = listKey ? (d[listKey] as unknown[] | undefined) : undefined;
  if (list && screen.height != null) {
    const keep = rowsFor(screen, d.title != null);
    if (list.length <= PRECUT_OVER || list.length <= keep) return undefined;
    d[listKey!] = list.slice(0, keep);
    return `First ${keep} of ${list.length}`;
  }
  if (choice.template === 'bar_chart' && Array.isArray(d.categories) && d.categories.length > 8) {
    const cats = d.categories as string[];
    const series = d.series as Array<{ name: string; values: Array<number | null> }>;
    const pre = typeof d.subtitle === 'string' ? /^Top \d+ of (\d+)$/.exec(d.subtitle) : null;
    const timeLike = d.sort === 'none' || cats.every(isTimeLike);
    if (timeLike) {
      d.categories = cats.slice(-8);
      d.series = series.map((s) => ({ ...s, values: s.values.slice(-8) }));
      return `Last 8 of ${cats.length}`;
    }
    const total = (i: number) => series.reduce((a, s) => a + (s.values[i] ?? 0), 0);
    const order = cats.map((_, i) => i).sort((a, b) => total(b) - total(a));
    // Already cut to a top N upstream: the rest is unknown, so no "Other".
    const kept = order.slice(0, pre ? 8 : 7);
    const rest = order.slice(kept.length);
    d.categories = [...kept.map((i) => cats[i]!), ...(pre ? [] : ['Other'])];
    d.series = series.map((s) => ({ ...s, values: [...kept.map((i) => s.values[i] ?? null), ...(pre ? [] : [rest.reduce((a, i) => a + (s.values[i] ?? 0), 0)])] }));
    if (pre) delete d.subtitle;
    return pre ? `Top 8 of ${pre[1]}` : `Top 7 of ${cats.length}, rest as Other`;
  }
  if (choice.template === 'pie_chart' && Array.isArray(d.slices) && d.slices.length > 6) {
    const slices = [...(d.slices as Array<{ label: string; value: number }>)].sort((a, b) => b.value - a.value);
    d.slices = [...slices.slice(0, 5), { label: 'Other', value: slices.slice(5).reduce((a, s) => a + s.value, 0) }];
    return `Top 5 of ${slices.length}, rest as Other`;
  }
  if (choice.template === 'line_chart' && Array.isArray(d.x) && d.x.length > PRECUT_OVER) {
    const n = (d.x as unknown[]).length;
    d.x = (d.x as unknown[]).slice(-PRECUT_OVER);
    d.series = (d.series as Array<{ values: unknown[] }>).map((s) => ({ ...s, values: s.values.slice(-PRECUT_OVER) }));
    return `Last ${PRECUT_OVER} of ${n}`;
  }
  return undefined;
}

interface ChooseContext {
  /** Templates the choice must not land on (to find a runner-up). */
  exclude: string[];
}

function parseData(data: unknown): unknown {
  if (typeof data !== 'string') return data;
  try {
    const parsed = JSON.parse(data);
    if (parsed && typeof parsed === 'object') return parsed;
  } catch {
    // plain text
  }
  return data;
}

export function chooseVisual(input: VisualizeInput, registry: Registry): Choice {
  return choose(input, registry, { exclude: [] });
}

/**
 * Like chooseVisual for a template the caller picked: skips the choice but
 * still shapes the data for it (see `adapt`). Throws AdaptError when it can't.
 */
export function adaptTo(template: string, input: VisualizeInput, registry: Registry): Choice {
  return finish(adapt(template, input, registry), input, registry);
}

/** Second choices per template, tried in order when the rules have no other branch for the data. */
const ALTERNATIVES: Partial<Record<string, string[]>> = {
  line_chart: ['bar_chart', 'table'],
  bar_chart: ['pie_chart', 'table'],
  pie_chart: ['bar_chart'],
  stats: ['key_value', 'bar_chart'],
  key_value: ['table'],
  table: ['key_value', 'list'],
  list: ['tags', 'table'],
  tags: ['list'],
  scatter_chart: ['table'],
  map: ['table'],
  markdown: ['text_card'],
  text_card: ['markdown'],
  badge: ['text_card'],
  weather: ['line_chart', 'table'],
  gauge: ['stats'],
  countdown: ['text_card'],
  progress: ['bar_chart', 'table'],
  activity: ['progress'],
  dashboard: ['table'],
  world_clock: ['table'],
  candlestick: ['line_chart', 'table'],
  stock_quote: ['key_value'],
};

export interface Alternative {
  template: string;
  reason: string;
}

/**
 * The second-best template for the same input: the rules run again with the
 * first choice excluded (hints and screen swaps then fall back to the plain
 * shape rules), else the first alternative the data can be shaped for.
 */
export function runnerUp(input: VisualizeInput, first: Choice, registry: Registry): Alternative | null {
  if (!first.reason.startsWith('the data already matches')) {
    try {
      const alt = choose(input, registry, { exclude: [first.template] });
      if (alt.template !== first.template) return { template: alt.template, reason: alt.reason };
    } catch {
      // no other branch
    }
  }
  for (const template of ALTERNATIVES[first.template] ?? []) {
    try {
      const alt = adaptTo(template, input, registry);
      return { template, reason: alt.reason };
    } catch {
      // try the next
    }
  }
  return null;
}

function choose(input: VisualizeInput, registry: Registry, ctx: ChooseContext): Choice {
  let choice = shapeChoice(input, registry, ctx);
  if (input.screen?.small) choice = fitScreen(choice, input.screen, ctx.exclude);
  return finish(choice, input, registry);
}

/** Places the title and subtitle and cleans the data. */
function finish(choice: Choice, input: VisualizeInput, registry: Registry): Choice {
  // Titles go wherever the chosen template has a place for them, unless already used as a label.
  const shape = (registry.get(choice.template)?.schema as { shape?: Record<string, unknown> } | undefined)?.shape ?? {};
  const titleUsed = input.title != null && JSON.stringify(choice.data).includes(JSON.stringify(input.title));
  if (input.title && 'title' in shape && choice.data.title == null && !titleUsed) choice.data.title = input.title;
  if (input.subtitle && 'subtitle' in shape && choice.data.subtitle == null) choice.data.subtitle = input.subtitle;
  const cut = input.screen?.small ? trimForScreen(choice, input.screen) : undefined;
  if (cut) {
    if ('subtitle' in shape) choice.data.subtitle = choice.data.subtitle ? `${choice.data.subtitle} · ${cut}` : cut;
    choice.reason += `; ${cut.toLowerCase()} for the ${screenName(input.screen!)}`;
  }
  // Drop undefined keys so the data is clean to read and reuse.
  choice.data = JSON.parse(JSON.stringify(choice.data));
  return choice;
}

function shapeChoice(input: VisualizeInput, registry: Registry, ctx: ChooseContext): Choice {
  const data = parseData(input.data);
  const keys = isRow(data) ? Object.keys(data) : [];
  const match = isRow(data) ? SIGNATURES.find(([id, sig]) => !ctx.exclude.includes(id) && sig.every((k) => keys.includes(k)) && registry.get(id)?.schema.safeParse(data).success) : undefined;
  // Words and key names pick a richer template when the evidence is strong.
  const hinted = match ? null : hintChoice(data, input, registry, ctx.exclude);
  if (hinted) return hinted;
  let choice: Choice;
  if (isRow(data)) {
    choice = match
      ? { template: match[0], data: data as Row, reason: `the data already matches ${match[0]}` }
      : fromRecord(data as Row, input.intent, input.title);
  } else if (Array.isArray(data)) {
    choice = fromArray(data, input.intent, input.title);
  } else if (typeof data === 'number' || toNumber(data) != null) {
    choice = { template: 'stats', data: { items: [{ label: input.title ?? 'Value', value: toNumber(data) }] }, reason: 'a single number' };
  } else if (typeof data === 'boolean') {
    choice = { template: 'badge', data: { label: input.title ?? 'Status', value: data ? 'yes' : 'no', tone: data ? 'success' : 'critical' }, reason: 'a yes/no value' };
  } else if (typeof data === 'string' && data.trim()) {
    const text = data.trim();
    const markdown = text.length > 280 || /^#{1,6}\s|\n\s*[-*]\s|\n\s*\d+\.\s|```|\|.+\|/m.test(text);
    choice = markdown
      ? { template: 'markdown', data: { markdown: input.title ? `# ${input.title}\n\n${text}` : text }, reason: 'long or structured text' }
      : { template: 'text_card', data: { text }, reason: 'a short piece of text' };
  } else {
    throw new Error('Nothing to visualize: send a number, text, a list, an object or rows.');
  }
  return choice;
}
