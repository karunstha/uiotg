export type Mode = 'light' | 'dark';

export type Status = 'good' | 'warning' | 'serious' | 'critical';

export interface Theme {
  mode: Mode;
  /** Page plane behind cards (dashboards). */
  plane: string;
  /** Default card / chart surface. */
  surface: string;
  /** Subtle fill one step off the surface: tracks, table headers, empty cells. */
  subtle: string;
  text: string;
  text2: string;
  muted: string;
  grid: string;
  axis: string;
  border: string;
  accent: string;
  /** Lighter step of the accent ramp, used for meter tracks. */
  accentTrack: string;
  /** Categorical palette in fixed order. Never cycled past 8. */
  series: readonly string[];
  /** Neutral used for folded "Other" buckets and de-emphasised marks. */
  other: string;
  /** Sequential ramp ordered from "near zero" (recedes into surface) to "max". */
  sequential: readonly string[];
  /** Ordinal steps that all clear 2:1 against the surface, low to high. */
  ordinal: readonly string[];
  /** Diverging: negative pole … neutral midpoint … positive pole. */
  diverging: readonly string[];
  status: Record<Status, string>;
  /** Text-safe "up is good" / "down is bad" colors for deltas. */
  positive: string;
  negative: string;
  fontSans: string;
  fontMono: string;
}

// Blue ramp, steps 100 → 700 (validated reference palette).
const BLUE = ['#cde2fb', '#b7d3f6', '#9ec5f4', '#86b6ef', '#6da7ec', '#5598e7', '#3987e5', '#2a78d6', '#256abf', '#1c5cab', '#184f95', '#104281', '#0d366b'];
// Red ramp lightness-matched to BLUE (OKLCH hue 25°); used for the diverging arm.
const RED = ['#fad6d2', '#f4c2bd', '#f1aea8', '#ea9a93', '#e4857e', '#dd716a', '#d75853', '#c74845', '#b13f3c', '#9e3432', '#892b2a', '#762221', '#621b1a'];

const STATUS: Record<Status, string> = {
  good: '#0ca30c',
  warning: '#fab219',
  serious: '#ec835a',
  critical: '#d03b3b',
};

export const FONT_SANS = "Inter, system-ui, -apple-system, 'Segoe UI', 'Noto Sans', sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji'";
export const FONT_MONO = "'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, Consolas, monospace";

const LIGHT: Theme = {
  mode: 'light',
  plane: '#f4f3f0',
  surface: '#fcfcfb',
  subtle: '#f0efec',
  text: '#0b0b0b',
  text2: '#52514e',
  muted: '#898781',
  grid: '#e1e0d9',
  axis: '#c3c2b7',
  border: 'rgba(11,11,11,0.10)',
  accent: '#2a78d6',
  accentTrack: '#cde2fb',
  series: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'],
  other: '#b5b3ab',
  sequential: [BLUE[0]!, BLUE[2]!, BLUE[4]!, BLUE[6]!, BLUE[8]!, BLUE[10]!, BLUE[12]!],
  ordinal: [BLUE[3]!, BLUE[5]!, BLUE[7]!, BLUE[9]!, BLUE[11]!],
  diverging: [RED[11]!, RED[8]!, RED[5]!, RED[2]!, '#f0efec', BLUE[2]!, BLUE[5]!, BLUE[8]!, BLUE[11]!],
  status: STATUS,
  positive: '#006300',
  negative: '#c0392f',
  fontSans: FONT_SANS,
  fontMono: FONT_MONO,
};

const DARK: Theme = {
  mode: 'dark',
  plane: '#0d0d0d',
  surface: '#1a1a19',
  subtle: '#262624',
  text: '#ffffff',
  text2: '#c3c2b7',
  muted: '#898781',
  grid: '#2c2c2a',
  axis: '#383835',
  border: 'rgba(255,255,255,0.10)',
  accent: '#3987e5',
  accentTrack: '#173a63',
  series: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'],
  other: '#5c5b56',
  // In dark mode "near zero" recedes toward the dark surface, so the ramp runs dark → light.
  sequential: ['#1f2b3a', BLUE[12]!, BLUE[10]!, BLUE[8]!, BLUE[6]!, BLUE[4]!, BLUE[2]!],
  ordinal: [BLUE[10]!, BLUE[8]!, BLUE[6]!, BLUE[4]!, BLUE[2]!],
  diverging: [RED[2]!, RED[5]!, RED[8]!, RED[10]!, '#383835', BLUE[10]!, BLUE[8]!, BLUE[5]!, BLUE[2]!],
  status: STATUS,
  positive: '#0ca30c',
  negative: '#e66767',
  fontSans: FONT_SANS,
  fontMono: FONT_MONO,
};

export function getTheme(mode: Mode, accent?: string): Theme {
  const base = mode === 'dark' ? DARK : LIGHT;
  if (!accent) return base;
  return { ...base, accent, accentTrack: mix(accent, base.surface, mode === 'dark' ? 0.7 : 0.78) };
}

/** CSS custom properties for a theme, consumed by every template stylesheet. */
export function themeVars(t: Theme): string {
  const vars: Record<string, string> = {
    plane: t.plane,
    surface: t.surface,
    subtle: t.subtle,
    text: t.text,
    'text-2': t.text2,
    muted: t.muted,
    grid: t.grid,
    axis: t.axis,
    border: t.border,
    accent: t.accent,
    'accent-track': t.accentTrack,
    other: t.other,
    good: t.status.good,
    warning: t.status.warning,
    serious: t.status.serious,
    critical: t.status.critical,
    positive: t.positive,
    negative: t.negative,
    'font-sans': t.fontSans,
    'font-mono': t.fontMono,
  };
  t.series.forEach((c, i) => (vars[`s${i + 1}`] = c));
  return Object.entries(vars).map(([k, v]) => `--${k}:${v}`).join(';');
}

/** Categorical color for slot `i`; slots past the palette fold to the neutral "other" color. */
export function seriesColor(t: Theme, i: number, override?: string): string {
  return override ?? t.series[i] ?? t.other;
}

/** Picks a sequential-ramp color for `v` in [0, 1]. */
export function sequentialColor(t: Theme, v: number): string {
  const steps = t.sequential;
  const idx = Math.round(Math.min(1, Math.max(0, v)) * (steps.length - 1));
  return steps[idx]!;
}

// --- color math --------------------------------------------------------------

export function parseHex(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  let h = m[1]!;
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
}

function toHex(rgb: [number, number, number]): string {
  return '#' + rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
}

/** Mixes `a` toward `b` by `amount` (0 = a, 1 = b). Non-hex inputs return `a`. */
export function mix(a: string, b: string, amount: number): string {
  const ra = parseHex(a);
  const rb = parseHex(b);
  if (!ra || !rb) return a;
  return toHex([0, 1, 2].map((i) => ra[i]! + (rb[i]! - ra[i]!) * amount) as [number, number, number]);
}

export function luminance(color: string): number {
  const rgb = parseHex(color);
  if (!rgb) return 0.5;
  const [r, g, b] = rgb.map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Ink (white or near-black) that clears contrast on top of `fill`. */
export function inkOn(fill: string): string {
  return luminance(fill) > 0.36 ? '#0b0b0b' : '#ffffff';
}

/** Stable hue (0–359) derived from a string, for generated placeholders. */
export function hashHue(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % 360;
}

/** A generated two-stop gradient, used when an image URL is missing or fails to load. */
export function placeholderGradient(seed: string): string {
  const h = hashHue(seed);
  return `linear-gradient(135deg, hsl(${h} 62% 58%), hsl(${(h + 48) % 360} 58% 32%))`;
}

/** Color at position `t` (0–1) along a ramp, interpolating between steps. */
export function rampColor(ramp: readonly string[], t: number): string {
  const x = Math.min(1, Math.max(0, Number.isFinite(t) ? t : 0)) * (ramp.length - 1);
  const i = Math.min(ramp.length - 2, Math.floor(x));
  return mix(ramp[i]!, ramp[i + 1]!, x - i);
}
