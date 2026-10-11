/**
 * Themes: built-in presets and custom themes that agents design and save.
 *
 * A theme is a small spec: a light or dark base plus whichever colors you want
 * to change. Usually three seeds are enough (background, text, accent); every
 * other token is derived from them, and any of those can be overridden too.
 * Built-in presets are written in the same format.
 */
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { contrast, DARK, FONT_MONO, FONT_SANS, inkOn, LIGHT, mix, parseHex, type Theme } from './theme.ts';

const hex = z.string().regex(/^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/, 'Expected a hex color like #ff79c6');

export const FONTS = {
  sans: FONT_SANS,
  serif: "'Source Serif 4', Georgia, 'Times New Roman', serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji'",
  mono: FONT_MONO,
  rounded: "Nunito, 'Arial Rounded MT Bold', system-ui, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji'",
} as const;

const CORNERS = { sharp: 0, small: 0.5, default: 1, round: 1.6 } as const;

/** What an agent can set. Every field is optional; the guide text doubles as documentation. */
export const themeSpecSchema = z.object({
  base: z.enum(['light', 'dark']).default('light').describe('Starting point for anything you leave out. Also tells templates the card is light or dark (night clock faces, glows).'),
  background: hex.optional().describe('Card background: every card, chart and table sits on it.'),
  text: hex.optional().describe('Main text: titles, big numbers, table cells. Needs 4.5:1 contrast on the background.'),
  accent: hex.optional().describe('Signature color: progress fills, highlights, links, "today", the first chart series and single-color heatmaps.'),
  page: hex.optional().describe('Page behind dashboard blocks. Derived: a step off the background.'),
  subtle: hex.optional().describe('Soft fills: stat tiles, meter tracks, table headers, empty cells. Derived from background + text.'),
  text_secondary: hex.optional().describe('Subtitles, labels, legends. Derived; needs 3:1 on the background.'),
  muted: hex.optional().describe('Captions, axis labels, timestamps. Derived.'),
  grid: hex.optional().describe('Chart grid lines and row dividers. Derived.'),
  axis: hex.optional().describe('Chart axes and heavier dividers. Derived.'),
  border: hex.optional().describe('Card and tile outlines. Derived.'),
  series: z.array(hex).min(1).max(8).optional().describe('Chart colors in order (bars, lines, slices, rings, legend keys). Missing slots: the accent first, then the base palette. Keep them clearly different from each other.'),
  positive: hex.optional().describe('Good deltas (↑ revenue) and rising candles.'),
  negative: hex.optional().describe('Bad deltas (↓ revenue) and falling candles.'),
  status: z
    .object({ good: hex.optional(), warning: hex.optional(), serious: hex.optional(), critical: hex.optional() })
    .optional()
    .describe('Status dots, alerts, badges, uptime bars. Change with care: people read these as green/amber/red.'),
  font: z.enum(['sans', 'serif', 'mono', 'rounded']).default('sans').describe('sans (Inter), serif (Source Serif), mono (JetBrains Mono, terminal look), rounded (Nunito, friendly).'),
  corners: z.enum(['sharp', 'small', 'default', 'round']).default('default').describe('Corner rounding of cards, tiles and bars; "sharp" squares off pills too.'),
});

export type ThemeSpec = z.input<typeof themeSpecSchema>;

/** Built-in presets, in the same format agents use. `light` and `dark` are the hand-tuned originals. */
export const PRESETS: Record<string, ThemeSpec> = {
  light: { base: 'light' },
  dark: { base: 'dark' },
  midnight: { base: 'dark', background: '#0f1424', text: '#e6e9f2', accent: '#7aa2ff', page: '#0a0e1a',
    series: ['#7aa2ff', '#f78c6c', '#5fd3a6', '#ffcb6b', '#ff79c6', '#c792ea', '#89ddff', '#d4d8e3'] },
  nord: {
    base: 'dark',
    background: '#2e3440',
    text: '#eceff4',
    accent: '#88c0d0',
    series: ['#88c0d0', '#d08770', '#a3be8c', '#ebcb8b', '#b48ead', '#5e81ac', '#bf616a', '#e5e9f0'],
    positive: '#a3be8c',
    negative: '#bf616a',
    status: { good: '#a3be8c', warning: '#ebcb8b', serious: '#d08770', critical: '#bf616a' },
  },
  solarized: {
    base: 'light',
    background: '#fdf6e3',
    text: '#073642',
    accent: '#268bd2',
    series: ['#268bd2', '#cb4b16', '#859900', '#b58900', '#d33682', '#2aa198', '#6c71c4', '#dc322f'],
    positive: '#5f6e00',
    negative: '#c0362c',
  },
  paper: { base: 'light', background: '#fbf7ef', text: '#2b2723', accent: '#9c4221', font: 'serif', corners: 'small',
    series: ['#9c4221', '#3d6b8c', '#5b7f3a', '#b7791f', '#8a4f7d', '#2f6f6a', '#6b5b95', '#c9a227'] },
  terminal: {
    base: 'dark',
    background: '#0a0f0a',
    text: '#c8f7c5',
    accent: '#33ff66',
    font: 'mono',
    corners: 'sharp',
    series: ['#33ff66', '#ffb000', '#00d7ff', '#ff5f87', '#d7d700', '#af87ff', '#5fd7af', '#ff8700'],
    positive: '#33ff66',
    negative: '#ff5f5f',
  },
  'high-contrast': {
    base: 'light',
    background: '#ffffff',
    text: '#000000',
    text_secondary: '#1f1f1f',
    muted: '#4a4a4a',
    accent: '#0047ab',
    border: '#000000',
    // Okabe–Ito, distinguishable with common color-vision deficiencies.
    series: ['#0072b2', '#e69f00', '#009e73', '#cc79a7', '#56b4e9', '#d55e00', '#8a6d00', '#000000'],
  },
};

/** Builds a full theme from a spec: unset tokens are derived from the seeds. */
export function buildTheme(input: ThemeSpec, name = 'custom'): Theme {
  const spec = themeSpecSchema.parse(input);
  const base = spec.base === 'dark' ? DARK : LIGHT;
  const dark = spec.base === 'dark';
  const neutrals = !!(spec.background || spec.text);
  const S = spec.background ?? base.surface;
  const T = spec.text ?? base.text;
  const A = spec.accent ?? base.accent;
  /** 0 = the background, 1 = the text color. */
  const toward = (amount: number) => mix(S, T, amount);

  const subtle = spec.subtle ?? (neutrals ? toward(dark ? 0.08 : 0.055) : base.subtle);
  // Given colors first (else the accent), then base colors that don't clash with them.
  const lead = spec.series ?? (spec.accent ? [A] : []);
  const series = [...lead, ...base.series.filter((c) => lead.every((l) => distance(c, l) >= SIMILAR))].slice(0, 8);
  // Single-hue ramps run from "near zero" (close to the background) to full strength.
  const ramp = (steps: number[]) => steps.map((t) => (t <= 1 ? mix(S, A, t) : mix(A, T, t - 1)));
  const rampsCustom = !!(spec.accent || neutrals);
  const negative = spec.negative ?? base.negative;
  return {
    name,
    mode: spec.base,
    plane: spec.page ?? (neutrals ? (dark ? mix(S, '#000000', 0.35) : toward(0.035)) : base.plane),
    surface: S,
    subtle,
    text: T,
    text2: spec.text_secondary ?? (neutrals ? toward(0.74) : base.text2),
    muted: spec.muted ?? (neutrals ? toward(0.54) : base.muted),
    grid: spec.grid ?? (neutrals ? toward(dark ? 0.12 : 0.11) : base.grid),
    axis: spec.axis ?? (neutrals ? toward(dark ? 0.2 : 0.23) : base.axis),
    border: spec.border ?? (neutrals ? toward(0.12) : base.border),
    accent: A,
    accentTrack: mix(A, S, dark ? 0.7 : 0.78),
    onAccent: inkOn(A),
    series,
    other: neutrals ? toward(0.3) : base.other,
    sequential: rampsCustom ? ramp([0.12, 0.28, 0.45, 0.62, 0.8, 1, 1.3]) : base.sequential,
    ordinal: rampsCustom ? ramp([0.35, 0.55, 0.75, 1, 1.25]) : base.ordinal,
    diverging: rampsCustom
      ? [mix(negative, T, 0.3), negative, mix(negative, S, 0.4), mix(negative, S, 0.72), subtle, mix(A, S, 0.72), mix(A, S, 0.4), A, mix(A, T, 0.3)]
      : base.diverging,
    status: { ...base.status, ...spec.status },
    positive: spec.positive ?? base.positive,
    negative,
    fontSans: FONTS[spec.font],
    fontMono: FONT_MONO,
    radius: CORNERS[spec.corners],
    pill: spec.corners === 'sharp' ? '2px' : '999px',
  };
}

export interface ThemeReport {
  /** Problems that make text unreadable; a theme with errors is rejected. */
  errors: string[];
  /** Things that look off but still work. */
  warnings: string[];
}

/** Below this distance two chart colors read as the same series (the default palette's closest pair is 70). */
const SIMILAR = 60;

function distance(a: string, b: string): number {
  const [x, y] = [parseHex(a)!, parseHex(b)!];
  // "Redmean" weighted RGB distance: cheap and close enough to perceived difference.
  const r = (x[0] + y[0]) / 2;
  const [dr, dg, db] = [x[0] - y[0], x[1] - y[1], x[2] - y[2]];
  return Math.sqrt((2 + r / 256) * dr * dr + 4 * dg * dg + (2 + (255 - r) / 256) * db * db);
}

/** Readability checks, phrased so an agent can fix the spec. */
export function checkTheme(t: Theme): ThemeReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const ratio = (fg: string, bg: string) => contrast(fg, bg).toFixed(1);
  const need = (label: string, fg: string, bg: string, min: number, list: string[]) => {
    if (fg.startsWith('#') && bg.startsWith('#') && contrast(fg, bg) < min) list.push(`${label} (${fg} on ${bg}) is ${ratio(fg, bg)}:1; needs ${min}:1.`);
  };
  need('text on background', t.text, t.surface, 4.5, errors);
  need('text on page', t.text, t.plane, 4.5, errors);
  need('text on subtle', t.text, t.subtle, 4.5, errors);
  need('text_secondary on background', t.text2, t.surface, 3, errors);
  need('text_secondary on background', t.text2, t.surface, 4.5, warnings);
  need('muted on background', t.muted, t.surface, 2.5, warnings);
  need('accent on background', t.accent, t.surface, 2, warnings);
  need('positive on background', t.positive, t.surface, 3, warnings);
  need('negative on background', t.negative, t.surface, 3, warnings);
  t.series.forEach((c, i) => need(`series[${i}] on background`, c, t.surface, 1.6, warnings));
  for (let i = 0; i < t.series.length; i++)
    for (let j = i + 1; j < t.series.length; j++)
      if (distance(t.series[i]!, t.series[j]!) < SIMILAR) warnings.push(`series[${i}] ${t.series[i]} and series[${j}] ${t.series[j]} are hard to tell apart in charts.`);
  return { errors, warnings };
}

const NAME = /^[a-z0-9][a-z0-9_-]{0,39}$/;

export const themeNameSchema = z.string().regex(NAME, 'Lowercase letters, digits, - and _, up to 40 characters');

/**
 * Saved custom themes and the server-wide default, as JSON files in
 * UIOTG_THEMES_DIR (default ~/.config/uiotg/themes).
 */
export class ThemeStore {
  readonly dir: string;

  constructor(dir = process.env.UIOTG_THEMES_DIR || join(homedir(), '.config', 'uiotg', 'themes')) {
    this.dir = dir;
  }

  #read<T>(file: string): T | undefined {
    try {
      return JSON.parse(readFileSync(join(this.dir, file), 'utf8')) as T;
    } catch {
      return undefined;
    }
  }

  /** Saved theme names. */
  names(): string[] {
    try {
      return readdirSync(this.dir)
        .filter((f) => f.endsWith('.json') && f !== '_default.json')
        .map((f) => f.slice(0, -5))
        .filter((n) => NAME.test(n))
        .sort();
    } catch {
      return [];
    }
  }

  get(name: string): ThemeSpec | undefined {
    return NAME.test(name) ? this.#read<ThemeSpec>(`${name}.json`) : undefined;
  }

  save(name: string, spec: ThemeSpec): void {
    if (!NAME.test(name)) throw new Error(`Invalid theme name "${name}"`);
    if (name in PRESETS) throw new Error(`"${name}" is a built-in preset; pick another name`);
    mkdirSync(this.dir, { recursive: true });
    writeFileSync(join(this.dir, `${name}.json`), JSON.stringify(spec, null, 2));
  }

  delete(name: string): boolean {
    if (!this.get(name)) return false;
    rmSync(join(this.dir, `${name}.json`));
    if (this.getDefault() === name) this.setDefault(undefined);
    return true;
  }

  getDefault(): string | undefined {
    return this.#read<{ theme?: string }>('_default.json')?.theme;
  }

  /** Sets (or with undefined, clears) the default theme for renders that don't pick one. */
  setDefault(name: string | undefined): void {
    mkdirSync(this.dir, { recursive: true });
    if (name === undefined) rmSync(join(this.dir, '_default.json'), { force: true });
    else writeFileSync(join(this.dir, '_default.json'), JSON.stringify({ theme: name }));
  }
}

export class UnknownThemeError extends Error {
  constructor(name: string, available: string[]) {
    super(`Unknown theme "${name}". Available: ${available.join(', ')}. Create one with save_theme, or pass a theme object.`);
    this.name = 'UnknownThemeError';
  }
}

/** Resolves a theme name (preset or saved) or an inline spec. */
export function resolveTheme(input: string | ThemeSpec, store?: ThemeStore): Theme {
  if (typeof input !== 'string') return buildTheme(input);
  const preset = PRESETS[input];
  if (preset) return input === 'light' ? LIGHT : input === 'dark' ? DARK : buildTheme(preset, input);
  const saved = store?.get(input);
  if (saved) return buildTheme(saved, input);
  throw new UnknownThemeError(input, [...Object.keys(PRESETS), ...(store?.names() ?? [])]);
}

/** Text-heavy cards on a darkened photo: neutrals switch to light-on-dark, the theme's colors stay. */
export function photoTheme(t: Theme): Theme {
  if (t.mode === 'dark' && contrast(t.text, '#000000') > 12) return t;
  return {
    ...t,
    mode: 'dark',
    plane: DARK.plane,
    surface: DARK.surface,
    subtle: DARK.subtle,
    text: '#ffffff',
    text2: DARK.text2,
    muted: DARK.muted,
    grid: DARK.grid,
    axis: DARK.axis,
    border: DARK.border,
    other: DARK.other,
    accentTrack: mix(t.accent, DARK.surface, 0.7),
  };
}
