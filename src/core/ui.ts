import { html, raw, style, type Html } from './html.ts';
import { icon } from './icons.ts';
import { signed, type Formatter } from './format.ts';
import { placeholderGradient, type Status, type Theme } from './theme.ts';

export function header(d: { title?: string; subtitle?: string }, aside?: Html | null): Html | null {
  if (!d.title && !d.subtitle && !aside) return null;
  return html`<header class="hdr">
    <div class="hdr-text">
      ${d.title ? html`<div class="hdr-title">${d.title}</div>` : null}
      ${d.subtitle ? html`<div class="hdr-sub">${d.subtitle}</div>` : null}
    </div>
    ${aside ? html`<div class="hdr-aside">${aside}</div>` : null}
  </header>`;
}

/** Rough rendered height of `header()` so charts can size their plot to a fixed frame. */
export function headerHeight(d: { title?: string; subtitle?: string }): number {
  if (!d.title && !d.subtitle) return 0;
  return (d.title ? 26 : 0) + (d.subtitle ? 24 : 0) + 20;
}

export interface LegendItem {
  name: string;
  color: string;
  shape?: 'square' | 'line' | 'dot';
}

export function legend(items: LegendItem[]): Html | null {
  if (items.length === 0) return null;
  return html`<div class="legend">${items.map(
    (it) => html`<span class="legend-item"><span class="${`key key-${it.shape ?? 'square'}`}" style="${style({ background: it.color })}"></span>${it.name}</span>`,
  )}</div>`;
}

/** Rough legend height for a given content width (wraps by measuring label lengths). */
export function legendHeight(items: LegendItem[], width: number): number {
  if (items.length === 0) return 0;
  let rows = 1;
  let x = 0;
  for (const it of items) {
    const w = 17 + it.name.length * 7.2 + 18;
    if (x + w > width && x > 0) {
      rows++;
      x = 0;
    }
    x += w;
  }
  return rows * 20 + (rows - 1) * 6 + 14;
}

const STATUS_ICON: Record<Status, string> = {
  good: 'circle-check',
  warning: 'triangle-alert',
  serious: 'circle-alert',
  critical: 'octagon-alert',
};

const STATUS_LABEL: Record<Status, string> = {
  good: 'Good',
  warning: 'Warning',
  serious: 'Serious',
  critical: 'Critical',
};

/** Status always ships as icon + label, never color alone. */
export function statusBadge(status: Status, label?: string): Html {
  return html`<span class="status" style="${`--c:var(--${status})`}">${icon(STATUS_ICON[status], { size: 14 })}${label ?? STATUS_LABEL[status]}</span>`;
}

export function statusIcon(status: Status, size = 16): Html {
  return html`<span class="status-icon" style="${`color:var(--${status})`}">${icon(STATUS_ICON[status], { size })}</span>`;
}

/**
 * Signed change with direction arrow. `goodWhen` says whether an increase is
 * good news (revenue) or bad news (latency); color follows meaning, not sign.
 */
export function delta(value: number, fmt: Formatter, goodWhen: 'up' | 'down' = 'up', label?: string): Html {
  const dir = value > 0 ? 'up' : value < 0 ? 'down' : 'flat';
  const tone = dir === 'flat' ? 'flat' : dir === goodWhen ? 'pos' : 'neg';
  const arrow = dir === 'up' ? 'arrow-up-right' : dir === 'down' ? 'arrow-down-right' : 'arrow-right';
  return html`<span class="delta-wrap"><span class="${`delta ${tone}`}">${icon(arrow, { size: 14, strokeWidth: 2.5 })}${signed(value, fmt)}</span>${label ? html`<span class="delta-label">${label}</span>` : null}</span>`;
}

/** Text delta like "+12%" or "-3 pts": direction is read from the leading sign. */
export function textDelta(value: string, goodWhen: 'up' | 'down' = 'up', label?: string): Html {
  const t = value.trim();
  const dir = /^[-−–]/.test(t) ? 'down' : /^\+/.test(t) || /^[0-9.]/.test(t) ? 'up' : 'flat';
  const tone = dir === 'flat' ? 'flat' : dir === goodWhen ? 'pos' : 'neg';
  const arrow = dir === 'up' ? 'arrow-up-right' : dir === 'down' ? 'arrow-down-right' : 'arrow-right';
  return html`<span class="delta-wrap"><span class="${`delta ${tone}`}">${icon(arrow, { size: 14, strokeWidth: 2.5 })}${t}</span>${label ? html`<span class="delta-label">${label}</span>` : null}</span>`;
}

function cssUrl(url: string): string {
  return `url("${url.replace(/["\\\n\r]/g, (c) => encodeURIComponent(c))}")`;
}

/**
 * CSS `background-image` for a remote image with a generated gradient beneath
 * it, so a missing or broken URL still renders something intentional.
 */
export function imageBackground(url: string | undefined, seed: string): string {
  const fallback = placeholderGradient(seed);
  return url ? `${cssUrl(url)}, ${fallback}` : fallback;
}

export function initials(name: string): string {
  const words = name.replace(/[^\p{L}\p{N}\s]/gu, ' ').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '';
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return (words[0]![0]! + words[words.length - 1]![0]!).toUpperCase();
}

/**
 * A 2px sparkline in the de-emphasis ink with the latest point marked in the
 * accent color.
 */
export function sparkline(values: number[], opts: { width: number; height: number; theme: Theme; color?: string }): Html {
  const pts = values.filter((v) => Number.isFinite(v));
  if (pts.length < 2) return raw('');
  const { width: w, height: h } = opts;
  const pad = 4;
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const span = max - min || 1;
  const xy = pts.map((v, i) => [pad + (i / (pts.length - 1)) * (w - pad * 2), pad + (1 - (v - min) / span) * (h - pad * 2)] as const);
  const d = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('');
  const area = `${d}L${xy[xy.length - 1]![0].toFixed(1)} ${h}L${xy[0]![0].toFixed(1)} ${h}Z`;
  const [lx, ly] = xy[xy.length - 1]!;
  const accent = opts.color ?? opts.theme.accent;
  return raw(
    `<svg class="spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true">` +
      `<path d="${area}" fill="${accent}" opacity="0.10"/>` +
      `<path d="${d}" fill="none" stroke="${opts.theme.muted}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>` +
      `<circle cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="4" fill="${accent}" stroke="${opts.theme.surface}" stroke-width="2"/>` +
      `</svg>`,
  );
}
