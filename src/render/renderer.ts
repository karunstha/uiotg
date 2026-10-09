import { z } from 'zod';
import { colorSchema } from '../core/format.ts';
import { fontFaceCss } from '../core/fonts.ts';
import { html, raw, style, type Html } from '../core/html.ts';
import { getTheme, themeVars, type Mode, type Theme } from '../core/theme.ts';
import type { RenderContext, Size, Template } from '../core/types.ts';
import type { Registry } from '../registry.ts';
import { BASE_CSS } from './base-css.ts';
import { BrowserPool, type BrowserOptions } from './browser.ts';

export const renderOptionsSchema = z.object({
  width: z.number().int().min(160).max(2400).optional().describe('Image width in CSS px; defaults to the template’s preferred width'),
  height: z.number().int().min(80).max(4000).optional().describe('Fixed image height in CSS px; omit to fit the content'),
  theme: z.enum(['light', 'dark']).optional().describe('Color theme (default light)'),
  scale: z.number().min(1).max(3).optional().describe('Device pixel ratio; 2 (default) gives crisp images'),
  format: z.enum(['png', 'jpeg']).optional().describe('Image format (default png)'),
  quality: z.number().int().min(1).max(100).optional().describe('JPEG quality (default 90)'),
  transparent: z.boolean().optional().describe('Transparent background instead of the theme surface (png only)'),
  padding: z.number().int().min(0).max(160).optional().describe('Outer padding in CSS px'),
  accent: colorSchema.optional().describe('Override the UI accent color (progress, highlights, links)'),
});

export type RenderOptions = z.input<typeof renderOptionsSchema>;

export interface RenderResult {
  template: string;
  data: Buffer;
  mimeType: 'image/png' | 'image/jpeg';
  /** CSS pixel size; the bitmap is this times `scale`. */
  width: number;
  height: number;
  scale: number;
}

export interface HtmlResult {
  html: string;
  width: number;
  height?: number;
  theme: Mode;
}

export class TemplateNotFoundError extends Error {
  readonly template: string;
  constructor(template: string, known: string[]) {
    super(`Unknown template "${template}". Available: ${known.join(', ')}`);
    this.name = 'TemplateNotFoundError';
    this.template = template;
  }
}

export class TemplateDataError extends Error {
  readonly template: string;
  readonly issues: string[];
  constructor(template: string, issues: string[]) {
    super(`Invalid data for template "${template}":\n${issues.map((i) => `  - ${i}`).join('\n')}`);
    this.name = 'TemplateDataError';
    this.template = template;
    this.issues = issues;
  }
}

function formatPath(prefix: string, path: PropertyKey[]): string {
  let out = prefix;
  for (const seg of path) {
    if (typeof seg === 'number') out += `[${seg}]`;
    else out += out ? `.${String(seg)}` : String(seg);
  }
  return out || '(root)';
}

/** Some clients send nested objects as JSON strings; accept both. */
function coerceData(data: unknown): unknown {
  if (typeof data === 'string') {
    try {
      return JSON.parse(data);
    } catch {
      return data;
    }
  }
  return data ?? {};
}

const DEFAULT_PADDING = 32;
const BLOCK_PADDING = 20;
const MAX_PIXELS = 7900;
const MAX_AUTO_HEIGHT = 7900;
/** How long to wait for remote images before capturing what has loaded. */
const IMAGE_TIMEOUT_MS = 10_000;

export interface RendererOptions {
  registry: Registry;
  browser?: BrowserOptions | BrowserPool;
  /** Defaults applied under per-call options. Env: UIOTG_THEME, UIOTG_SCALE, UIOTG_FORMAT. */
  defaults?: RenderOptions;
}

export class Renderer {
  readonly registry: Registry;
  readonly browser: BrowserPool;
  readonly defaults: RenderOptions;

  constructor(opts: RendererOptions) {
    this.registry = opts.registry;
    this.browser = opts.browser instanceof BrowserPool ? opts.browser : new BrowserPool(opts.browser);
    const env: RenderOptions = {};
    if (process.env.UIOTG_THEME === 'dark' || process.env.UIOTG_THEME === 'light') env.theme = process.env.UIOTG_THEME;
    if (process.env.UIOTG_SCALE) env.scale = Number(process.env.UIOTG_SCALE);
    if (process.env.UIOTG_FORMAT === 'jpeg' || process.env.UIOTG_FORMAT === 'png') env.format = process.env.UIOTG_FORMAT;
    this.defaults = renderOptionsSchema.parse({ ...env, ...opts.defaults });
  }

  #template(id: string): Template {
    const t = this.registry.get(id);
    if (!t) throw new TemplateNotFoundError(id, this.registry.ids());
    return t;
  }

  #validate(t: Template, data: unknown, path: string): unknown {
    const result = t.schema.safeParse(coerceData(data));
    if (result.success) return result.data;
    throw new TemplateDataError(
      t.id,
      result.error.issues.map((issue) => `${formatPath(path, issue.path)}: ${issue.message}`),
    );
  }

  #context(theme: Theme, used: Set<Template>, size: Size, depth: number): RenderContext {
    return {
      ...size,
      theme,
      renderBlock: async (id, data, box, path) => {
        if (depth >= 2) throw new Error(`Blocks can't nest more than two levels (at ${path})`);
        const child = this.#template(id);
        if (child.category === 'layout') throw new TemplateDataError(id, [`${path}: layout templates can't be nested`]);
        const parsed = this.#validate(child, data, path);
        used.add(child);
        const bare = child.embed === 'bare';
        const pad = bare || child.padding === 0 ? 0 : BLOCK_PADDING;
        const inner: Size = { width: box.width - pad * 2, height: box.height ? box.height - pad * 2 : undefined };
        const body = await child.render(parsed, this.#context(theme, used, inner, depth + 1));
        return html`<div class="${`block tpl-${child.id}${bare ? ' bare' : ''}`}" style="${style({ padding: pad, height: box.height })}">${body}</div>`;
      },
    };
  }

  /** Validates `data` and builds the self-contained HTML document for a template. */
  async toHtml(templateId: string, data: unknown, options: RenderOptions = {}): Promise<HtmlResult> {
    const opts = { ...this.defaults, ...renderOptionsSchema.parse(options) };
    const t = this.#template(templateId);
    const parsed = this.#validate(t, data, '');
    const mode: Mode = opts.theme ?? 'light';
    const theme = getTheme(mode, opts.accent);
    const width = opts.width ?? (typeof t.width === 'function' ? t.width(parsed as never) : t.width);
    const height = opts.height ?? t.height;
    const padding = opts.padding ?? t.padding ?? DEFAULT_PADDING;
    const used = new Set<Template>([t]);
    const ctx = this.#context(theme, used, { width: width - padding * 2, height: height ? height - padding * 2 : undefined }, 0);
    const body = await t.render(parsed, ctx);
    const css = [...used].map((u) => u.css ?? '').join('\n');
    const rootClass = `frame-${t.background ?? 'surface'} tpl-${t.id}${opts.transparent ? ' transparent' : ''}`;
    const doc = html`<!doctype html>
<html lang="en" data-theme="${mode}">
<head>
<meta charset="utf-8">
<style>${raw(fontFaceCss())}</style>
<style>:root{${raw(themeVars(theme))};color-scheme:${mode}}${raw(BASE_CSS)}${raw(css)}</style>
</head>
<body><div id="root" class="${rootClass}" style="${style({ width, height, padding })}">${body}</div></body>
</html>`;
    return { html: doc.value, width, height, theme: mode };
  }

  /** Renders a template to an image. */
  async render(templateId: string, data: unknown, options: RenderOptions = {}): Promise<RenderResult> {
    const opts = { ...this.defaults, ...renderOptionsSchema.parse(options) };
    const doc = await this.toHtml(templateId, data, opts);
    const format = opts.format ?? 'png';
    const scale = opts.scale ?? 2;
    return this.browser.withPage(
      { width: doc.width, height: doc.height ?? 600, scale, colorScheme: doc.theme },
      async (page) => {
        try {
          await page.setContent(doc.html, { waitUntil: 'load', timeout: IMAGE_TIMEOUT_MS });
        } catch (err) {
          // A slow remote image shouldn't fail the render; capture what loaded.
          if ((err as Error).name !== 'TimeoutError') throw err;
        }
        await page.evaluate(() => document.fonts.ready.then(() => true)).catch(() => {});
        let height = doc.height;
        if (!height) {
          const box = await page.locator('#root').boundingBox();
          // Round down: rounding up would expose a sub-pixel sliver below full-bleed content.
          height = Math.min(MAX_AUTO_HEIGHT, Math.max(1, Math.floor(box?.height ?? 1)));
        }
        // Keep the bitmap within what image-consuming models accept: very large
        // outputs fall back to one bitmap pixel per CSS pixel.
        const fits = doc.width * scale <= MAX_PIXELS && height * scale <= MAX_PIXELS;
        await page.setViewportSize({ width: doc.width, height });
        const data = await page.screenshot({
          type: format,
          quality: format === 'jpeg' ? (opts.quality ?? 90) : undefined,
          omitBackground: format === 'png' && !!opts.transparent,
          scale: fits ? 'device' : 'css',
          animations: 'disabled',
          caret: 'hide',
        });
        return {
          template: templateId,
          data,
          mimeType: format === 'jpeg' ? 'image/jpeg' : 'image/png',
          width: doc.width,
          height,
          scale: fits ? scale : 1,
        };
      },
    );
  }

  close(): Promise<void> {
    return this.browser.close();
  }
}
