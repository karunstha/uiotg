import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { Html, escapeHtml, raw } from './html.ts';

const require = createRequire(import.meta.url);
const ICON_DIR = join(dirname(require.resolve('lucide-static/package.json')), 'icons');
const cache = new Map<string, string | null>();

function body(name: string): string | null {
  if (cache.has(name)) return cache.get(name)!;
  let inner: string | null = null;
  try {
    const svg = readFileSync(join(ICON_DIR, `${name}.svg`), 'utf8');
    inner = /<svg[^>]*>([\s\S]*)<\/svg>/.exec(svg)?.[1]?.trim() ?? null;
  } catch {
    inner = null;
  }
  cache.set(name, inner);
  return inner;
}

export interface IconOptions {
  size?: number;
  strokeWidth?: number;
  className?: string;
}

/**
 * Renders a Lucide icon by name, or the given text if it isn't a known icon
 * name (so callers can pass emoji). Returns null for empty input.
 */
export function icon(name: string | undefined, opts: IconOptions = {}): Html | null {
  if (!name) return null;
  const size = opts.size ?? 16;
  const cls = `icon${opts.className ? ` ${opts.className}` : ''}`;
  const key = name.trim().toLowerCase().replace(/[\s_]+/g, '-');
  const inner = /^[a-z0-9-]+$/.test(key) ? body(key) : null;
  if (!inner) {
    // Unknown names render as text only when they look like an emoji or symbol; anything longer is dropped.
    if ([...name.trim()].length > 4) return null;
    return raw(`<span class="${cls} glyph" style="font-size:${Math.round(size * 0.9)}px;width:${size}px;height:${size}px">${escapeHtml(name)}</span>`);
  }
  return raw(
    `<svg class="${cls}" xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${opts.strokeWidth ?? 2}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`,
  );
}

/** True when `name` resolves to a bundled icon. */
export function hasIcon(name: string): boolean {
  return body(name.trim().toLowerCase()) != null;
}
