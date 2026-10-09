import { z } from 'zod';

const LOCALE = process.env.UIOTG_LOCALE || 'en-US';

export const formatSchema = z
  .union([
    z.enum(['number', 'compact', 'percent', 'currency', 'currency_compact', 'integer']),
    z.object({
      style: z.enum(['number', 'percent', 'currency']).optional(),
      compact: z.boolean().optional().describe('Abbreviate large numbers: 12.9K, 4.2M'),
      currency: z.string().length(3).optional().describe('ISO 4217 code, default USD'),
      decimals: z.number().int().min(0).max(6).optional(),
      prefix: z.string().max(8).optional(),
      suffix: z.string().max(12).optional().describe('e.g. "%" for values already in percent, " ms", " kg"'),
    }),
  ])
  .describe(
    'How numbers are displayed. Shorthands: "number" (1,234.5), "integer", "compact" (12.9K), ' +
      '"percent" (expects fractions: 0.25 → 25%), "currency" ($1,234.00), "currency_compact" ($4.2M). ' +
      'For values already in percent use {"suffix":"%"}.',
  );

export type FormatSpec = z.infer<typeof formatSchema>;
export type Formatter = (value: number) => string;

interface NormalizedFormat {
  style: 'number' | 'percent' | 'currency';
  compact: boolean;
  currency: string;
  decimals?: number;
  prefix: string;
  suffix: string;
}

function normalize(spec: FormatSpec | undefined): NormalizedFormat {
  const base: NormalizedFormat = { style: 'number', compact: false, currency: 'USD', prefix: '', suffix: '' };
  if (!spec) return base;
  if (typeof spec === 'string') {
    switch (spec) {
      case 'compact':
        return { ...base, compact: true };
      case 'percent':
        return { ...base, style: 'percent' };
      case 'currency':
        return { ...base, style: 'currency' };
      case 'currency_compact':
        return { ...base, style: 'currency', compact: true };
      case 'integer':
        return { ...base, decimals: 0 };
      default:
        return base;
    }
  }
  return {
    style: spec.style ?? 'number',
    compact: spec.compact ?? false,
    currency: (spec.currency ?? 'USD').toUpperCase(),
    decimals: spec.decimals,
    prefix: spec.prefix ?? '',
    suffix: spec.suffix ?? '',
  };
}

export interface FormatterOptions {
  /** Drop trailing zero decimals (axis ticks are round numbers: $200, not $200.00). */
  minimalDecimals?: boolean;
}

export function makeFormatter(spec?: FormatSpec, options: FormatterOptions = {}): Formatter {
  const f = normalize(spec);
  const nfo: Intl.NumberFormatOptions = {};
  if (f.style === 'percent') nfo.style = 'percent';
  if (f.style === 'currency') {
    nfo.style = 'currency';
    nfo.currency = f.currency;
  }
  if (f.compact) nfo.notation = 'compact';
  if (f.decimals != null) {
    nfo.minimumFractionDigits = f.decimals;
    nfo.maximumFractionDigits = f.decimals;
  } else if (f.compact || f.style === 'percent') {
    nfo.minimumFractionDigits = 0;
    nfo.maximumFractionDigits = 1;
  } else if (options.minimalDecimals) {
    nfo.minimumFractionDigits = 0;
    nfo.maximumFractionDigits = 2;
  } else if (f.style !== 'currency') {
    // Currency keeps Intl's default of exactly two fraction digits ($1,234.50).
    nfo.maximumFractionDigits = 2;
  }
  let nf: Intl.NumberFormat;
  try {
    nf = new Intl.NumberFormat(LOCALE, nfo);
  } catch {
    nf = new Intl.NumberFormat(LOCALE, { ...nfo, style: 'decimal', currency: undefined });
  }
  return (value: number) => {
    if (value == null || Number.isNaN(value)) return '–';
    // A true minus sign (U+2212) instead of a hyphen, which sits too short and high.
    return `${f.prefix}${nf.format(value).replace(/^-/, '−')}${f.suffix}`;
  };
}

/** Formatter for axis ticks: inherits the series format but compacts large magnitudes. */
export function makeAxisFormatter(spec: FormatSpec | undefined, maxAbs: number): Formatter {
  const f = normalize(spec);
  if (!f.compact && maxAbs >= 10_000) return makeFormatter({ ...f, compact: true, decimals: undefined });
  if (f.decimals != null) return makeFormatter(spec);
  return makeFormatter({ ...f, decimals: undefined }, { minimalDecimals: true });
}

/** Renders a cell or label value: numbers through the formatter, everything else as text. */
export function display(value: unknown, fmt: Formatter): string {
  if (value == null) return '–';
  if (typeof value === 'number') return fmt(value);
  return String(value);
}

/** Signed delta text, e.g. "+12.5%" or "−3". Uses a real minus sign. */
export function signed(value: number, fmt: Formatter): string {
  const text = fmt(Math.abs(value));
  if (value > 0) return `+${text}`;
  if (value < 0) return `−${text}`;
  return text;
}

// --- shared schema pieces ------------------------------------------------------

export const colorSchema = z
  .string()
  .regex(/^(#[0-9a-fA-F]{3,8}|(rgb|rgba|hsl|hsla|oklch)\([\d\s.,%/a-z-]+\)|[a-zA-Z]{3,20})$/, 'Expected a CSS color like #2a78d6')
  .describe('CSS color, e.g. "#2a78d6"');

export const statusSchema = z
  .enum(['good', 'warning', 'serious', 'critical'])
  .describe('Semantic status; always shown with an icon and label, never color alone');

export const iconSchema = z
  .string()
  .max(40)
  .describe('Lucide icon name (e.g. "rocket", "users", "dollar-sign", "calendar") or a single emoji');

export const imageUrlSchema = z
  .string()
  .regex(/^(https?:\/\/|data:image\/)/i, 'Expected an http(s) or data:image URL')
  .describe('http(s) URL or data:image/... URI');

export const toneSchema = z
  .enum(['neutral', 'accent', 'info', 'success', 'warning', 'critical'])
  .describe('Color intent: neutral, accent (brand), info, success, warning or critical');

export const titleFields = {
  title: z.string().max(200).optional().describe('Heading shown above the content'),
  subtitle: z.string().max(400).optional().describe('One line of context under the title'),
};
