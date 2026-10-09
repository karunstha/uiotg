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
function inferFormat(name: string, raw: unknown[], nums: number[]): FormatSpec | undefined {
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

  // Everything else is a table, with an inline bar on the first measure.
  const firstNum = nums[0]?.key;
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

export function chooseVisual(input: VisualizeInput, registry: Registry): Choice {
  let data = input.data;
  if (typeof data === 'string') {
    try {
      const parsed = JSON.parse(data);
      if (parsed && typeof parsed === 'object') data = parsed;
    } catch {
      // plain text
    }
  }

  let choice: Choice;
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const keys = Object.keys(data);
    const match = SIGNATURES.find(([id, sig]) => sig.every((k) => keys.includes(k)) && registry.get(id)?.schema.safeParse(data).success);
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

  // Titles go wherever the chosen template has a place for them, unless already used as a label.
  const shape = (registry.get(choice.template)?.schema as { shape?: Record<string, unknown> } | undefined)?.shape ?? {};
  const titleUsed = input.title != null && JSON.stringify(choice.data).includes(JSON.stringify(input.title));
  if (input.title && 'title' in shape && choice.data.title == null && !titleUsed) choice.data.title = input.title;
  if (input.subtitle && 'subtitle' in shape && choice.data.subtitle == null) choice.data.subtitle = input.subtitle;
  // Drop undefined keys so the data is clean to read and reuse.
  choice.data = JSON.parse(JSON.stringify(choice.data));
  return choice;
}
