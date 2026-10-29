import { z } from 'zod';
import { framePhoto, photoSchema } from '../core/backdrop.ts';
import { colorSchema } from '../core/format.ts';
import { fontFaceCss } from '../core/fonts.ts';
import { html, raw, style, type Html } from '../core/html.ts';
import { imageBackground } from '../core/ui.ts';
import { fontScope, metricsFamily } from '../core/measure.ts';
import { paddingXY, sizeOptionsSchema } from '../core/options.ts';
import { themeVars, withAccent, type Mode, type Theme } from '../core/theme.ts';
import { photoTheme, PRESETS, resolveTheme, themeDefaults, themeLock, themeSpecSchema, ThemeStore, type ThemeSpec } from '../core/themes.ts';
import type { Detail, RenderContext, Size, Template } from '../core/types.ts';
import type { Registry } from '../registry.ts';
import { BASE_CSS } from './base-css.ts';
import { BrowserPool, type BrowserOptions } from './browser.ts';
import { auditOverflow, growToFit, type OverflowIssue } from './audit.ts';
import { centreContent, circleBox, circleLayout, CIRCLE_CSS } from './circle.ts';
import { measureFit, scaleContent, SCALE_FLOOR } from './shrink.ts';
import type { Page } from 'playwright';

const size = sizeOptionsSchema.shape;

export const renderOptionsSchema = z.object({
  width: size.width,
  height: size.height,
  theme: z
    .union([z.string().min(1).max(40), themeSpecSchema])
    .optional()
    .describe(`Theme: a preset (${Object.keys(PRESETS).join(', ')}), a saved custom theme's name, or an inline theme object (see list_themes). Defaults to the saved default theme, else light. The theme's own defaults (size, padding, ...) fill in options you leave out`),
  scale: size.scale,
  format: size.format,
  quality: size.quality,
  transparent: z.boolean().optional().describe('Transparent background instead of the theme surface (png only)'),
  padding: size.padding,
  accent: colorSchema.optional().describe('Override the UI accent color (progress, highlights, links)'),
  detail: size.detail,
  overflow: size.overflow,
  shape: size.shape,
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
  /** The detail level the template rendered at. */
  detail: Detail;
  /** Set when content didn't fit and the image grew: [requested, actual] in CSS px. */
  adjusted?: { width?: [number, number]; height?: [number, number] };
  /** Set when overflow "cap" cut items to keep a fixed height: items shown of total. */
  capped?: { shown: number; total: number };
  /** Set when overflow "cap" shrank the content to keep the fixed size: the factor, below 1. */
  scaled?: number;
}

export interface HtmlResult {
  html: string;
  detail: Detail;
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

type RequestedDetail = Detail | 'auto';

/** One rule for every template: small → minimal; roomy with enough data → rich; else standard. */
function resolveDetail(requested: RequestedDetail, t: Template, data: unknown, width: number): Detail {
  if (requested !== 'auto') return requested;
  if (width < 420) return 'minimal';
  if (width >= 600 && t.richWhen?.(data as never)) return 'rich';
  return 'standard';
}

const DEFAULT_PADDING = 32;
const BLOCK_PADDING = 20;
const MAX_PIXELS = 7900;
const MAX_AUTO_HEIGHT = 7900;
/** How long to wait for remote images before capturing what has loaded. */
const IMAGE_TIMEOUT_MS = 10_000;
/** Most re-renders overflow "cap" tries while looking for how many items fit. */
const MAX_CAP_TRIES = 10;
/** Most factors overflow "cap" tries while looking for how far to shrink the content. */
const MAX_SCALE_TRIES = 6;

export interface RendererOptions {
  registry: Registry;
  browser?: BrowserOptions | BrowserPool;
  /** Defaults applied under per-call options. Env: UIOTG_SCALE, UIOTG_FORMAT. */
  defaults?: RenderOptions;
  /** Saved custom themes and the default theme (UIOTG_THEMES_DIR). */
  themes?: ThemeStore;
}

export class Renderer {
  readonly registry: Registry;
  readonly browser: BrowserPool;
  readonly defaults: RenderOptions;
  readonly themes: ThemeStore;

  constructor(opts: RendererOptions) {
    this.registry = opts.registry;
    this.browser = opts.browser instanceof BrowserPool ? opts.browser : new BrowserPool(opts.browser);
    this.themes = opts.themes ?? new ThemeStore();
    const env: RenderOptions = {};
    if (process.env.UIOTG_SCALE) env.scale = Number(process.env.UIOTG_SCALE);
    if (process.env.UIOTG_FORMAT === 'jpeg' || process.env.UIOTG_FORMAT === 'png') env.format = process.env.UIOTG_FORMAT;
    this.defaults = renderOptionsSchema.parse({ ...env, ...opts.defaults });
  }

  /**
   * The theme for a render: the call's, else the saved default, else
   * UIOTG_THEME, else light. A default that no longer exists falls through.
   */
  #theme(requested: RenderOptions['theme']): Theme {
    return resolveTheme(this.#usedTheme(requested), this.themes);
  }

  /** Which theme a render uses, as a name or inline spec (see #theme). */
  #usedTheme(requested: RenderOptions['theme']): string | ThemeSpec {
    if (requested) return requested;
    for (const name of [this.themes.getDefault(), process.env.UIOTG_THEME]) {
      if (!name) continue;
      try {
        resolveTheme(name, this.themes);
        return name;
      } catch {
        // Deleted or misspelled default: try the next one.
      }
    }
    return 'light';
  }

  /**
   * Effective options, highest first: the call's, the used theme's `defaults`,
   * then this.defaults. Idempotent, so entry points can each apply it.
   */
  #options(options: RenderOptions): RenderOptions {
    const call = Object.fromEntries(Object.entries(renderOptionsSchema.parse(options)).filter(([, v]) => v !== undefined)) as RenderOptions;
    const theme = this.#usedTheme(call.theme ?? this.defaults.theme);
    const defaults = themeDefaults(theme, this.themes);
    const locked = Object.fromEntries(themeLock(theme, this.themes).flatMap((k) => (defaults[k] !== undefined ? [[k, defaults[k]]] : [])));
    return { ...this.defaults, ...defaults, ...call, ...locked };
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

  /** Validates the shared photo fields (template schemas don't declare them) and resolves the photo. */
  async #photo(t: Template, data: unknown): Promise<string | null> {
    const raw = coerceData(data);
    const fields = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
    const result = photoSchema.safeParse(fields);
    if (!result.success) throw new TemplateDataError(t.id, result.error.issues.map((issue) => `${formatPath('', issue.path)}: ${issue.message}`));
    return framePhoto(result.data, fields, t.photo!);
  }

  #context(theme: Theme, used: Set<Template>, size: Size, depth: number, detail: Detail, requested: RequestedDetail): RenderContext {
    return {
      ...size,
      theme,
      detail,
      renderBlock: async (id, data, box, path) => {
        if (depth >= 2) throw new Error(`Blocks can't nest more than two levels (at ${path})`);
        const child = this.#template(id);
        if (child.category === 'layout') throw new TemplateDataError(id, [`${path}: layout templates can't be nested`]);
        const parsed = this.#validate(child, data, path);
        used.add(child);
        const bare = child.embed === 'bare';
        const pad = bare || child.padding === 0 ? 0 : BLOCK_PADDING;
        const inner: Size = { width: box.width - pad * 2, height: box.height ? box.height - pad * 2 : undefined };
        const childDetail = resolveDetail(requested, child, parsed, inner.width);
        const body = await child.render(parsed, this.#context(theme, used, inner, depth + 1, childDetail, requested));
        return html`<div class="${`block tpl-${child.id}${bare ? ' bare' : ''}`}" style="${style({ padding: pad, height: box.height })}">${body}</div>`;
      },
      include: async (id, data) => {
        const child = this.#template(id);
        const parsed = this.#validate(child, data, '');
        used.add(child);
        return child.render(parsed, this.#context(theme, used, size, depth + 1, detail, requested));
      },
    };
  }

  /** The template's Template.truncate for this shape: its own round layout may cut differently. */
  #truncate(t: Template, round: boolean): Template['truncate'] {
    const fn = round && t.renderCircle ? (t.truncateCircle ?? t.truncate) : t.truncate;
    return fn?.bind(t);
  }

  /** Validates `data` and builds the self-contained HTML document for a template. */
  async toHtml(templateId: string, data: unknown, options: RenderOptions = {}): Promise<HtmlResult> {
    return this.#html(templateId, data, options);
  }

  /** toHtml, optionally keeping only the first `keep` items (Template.truncate). */
  async #html(
    templateId: string,
    data: unknown,
    options: RenderOptions,
    keep?: number,
  ): Promise<HtmlResult & { capped?: RenderResult['capped']; circle?: boolean }> {
    const opts = this.#options(options);
    const t = this.#template(templateId);
    const full = this.#validate(t, data, '');
    const round = opts.shape === 'circle';
    const truncate = this.#truncate(t, round);
    const cut = keep != null && truncate ? truncate(full as never, keep) : null;
    const parsed: unknown = cut ? cut.data : full;
    const capped = cut && cut.shown < cut.total ? { shown: cut.shown, total: cut.total } : undefined;
    const photo = t.photo ? await this.#photo(t, data) : null;
    const chosen = withAccent(this.#theme(opts.theme), opts.accent);
    // Text sits on a darkened photo: light-on-dark neutrals, see-through surfaces, the theme's colors kept.
    const theme = photo ? photoTheme(chosen) : chosen;
    const mode: Mode = theme.mode;
    const width = opts.width ?? (typeof t.width === 'function' ? t.width(full as never) : t.width);
    // A round screen needs a fixed square-ish frame: no height means a square.
    const height = opts.height ?? t.height ?? (round ? width : undefined);
    // On a circle the rim is the margin, so padding is only what the call or theme asks for, on top of it.
    const pad = paddingXY(opts.padding ?? (round ? 0 : (t.padding ?? DEFAULT_PADDING)));
    // A template's own round layout gets the rows box: the full safe circle, rows narrowed to their chords.
    const own = round && !!t.renderCircle;
    const rows = t.circle === 'rows' || own;
    const circle = round ? circleBox(width, height!, pad, rows) : null;
    const inset = circle?.inset ?? pad;
    const padding = inset.x === inset.y ? inset.x : `${inset.y}px ${inset.x}px`;
    const inner = circle ? { width: circle.width, height: circle.height } : { width: width - pad.x * 2, height: height ? height - pad.y * 2 : undefined };
    const used = new Set<Template>([t]);
    const requested = opts.detail ?? 'auto';
    const detail = resolveDetail(requested, t, parsed, inner.width);
    const ctx = this.#context(theme, used, inner, 0, detail, requested);
    const geometry = circle ? { diameter: Math.min(width, height!), safe: Math.min(circle.width, circle.height) } : null;
    const body = await fontScope.run(metricsFamily(theme.fontSans) ?? 'Inter', () =>
      own && geometry ? t.renderCircle!(parsed, { ...ctx, circle: geometry }) : t.render(parsed, geometry ? { ...ctx, circle: geometry } : ctx),
    );
    const css = [...used].map((u) => u.css ?? '').join('\n');
    // Shrink-wrapping templates size to their content, between minWidth and the default width.
    const fit = t.fit === 'content' && opts.width == null && !height;
    const rootStyle = fit
      ? style({ width: 'fit-content', 'min-width': `${Math.min(width, t.minWidth ?? 280)}px`, 'max-width': `${width}px`, padding })
      : style({ width, height, padding, '--circle': circle?.vars });
    const shapeClass = circle ? ` shape-circle ${rows ? 'circle-rows' : 'circle-square'}${own ? ' circle-own' : ''}` : '';
    const rootClass = `frame-${t.background ?? 'surface'} tpl-${t.id}${opts.transparent ? ' transparent' : ''}${photo ? ' on-bk photo' : ''}${shapeClass}`;
    const photoLayer = photo ? html`<div class="bk bg-img" style="${style({ 'background-image': imageBackground(photo, t.title) })}"></div><div class="bk-scrim"></div>` : null;
    const doc = html`<!doctype html>
<html lang="en" data-theme="${mode}">
<head>
<meta charset="utf-8">
<style>${raw(fontFaceCss())}</style>
<style>:root{${raw(themeVars(theme))};color-scheme:${mode}}${raw(BASE_CSS)}${raw(circle ? CIRCLE_CSS : '')}${raw(css)}</style>
</head>
<body><div id="root" class="${rootClass}" style="${rootStyle}">${photoLayer}${body}</div></body>
</html>`;
    return { html: doc.value, detail, width, height, theme: mode, capped, circle: !!circle };
  }

  /** Loads the document in a fresh page, waits for fonts and images, and grows the root to fit its content. */
  async #load<T>(
    templateId: string,
    data: unknown,
    options: RenderOptions,
    fn: (
      page: Page,
      doc: HtmlResult,
      size: { width: number; height: number; adjusted?: RenderResult['adjusted']; capped?: RenderResult['capped']; scaled?: number },
    ) => Promise<T>,
  ): Promise<T> {
    const opts = this.#options(options);
    let doc = await this.#html(templateId, data, opts);
    return this.browser.withPage({ width: doc.width, height: doc.height ?? 600, scale: opts.scale ?? 2, colorScheme: doc.theme }, async (page) => {
      const show = async (html: string) => {
        try {
          await page.setContent(html, { waitUntil: 'load', timeout: IMAGE_TIMEOUT_MS });
        } catch (err) {
          // A slow remote image shouldn't fail the render; capture what loaded.
          if ((err as Error).name !== 'TimeoutError') throw err;
        }
        await page.evaluate(() => document.fonts.ready.then(() => true)).catch(() => {});
      };
      // Shape "circle": fit the rows to the circle first (see circle.ts), then check for overflow.
      // Rows that can't fit their chord count as too tall, so overflow "cap" shows fewer.
      const settle = async () => {
        const round = doc.circle ? await page.evaluate(circleLayout) : { fits: true };
        const fit = await page.evaluate(growToFit);
        return { ...fit, tooTall: fit.grewHeight || !round.fits };
      };
      await show(doc.html);
      // Never clip: content wider than the image (or taller than a fixed height) grows it.
      if (doc.width < MAX_PIXELS) await page.setViewportSize({ width: MAX_PIXELS, height: doc.height ?? 600 });
      let fit = await settle();
      const t = this.#template(templateId);
      const truncate = this.#truncate(t, opts.shape === 'circle');
      if (fit.tooTall && opts.overflow === 'cap' && truncate) {
        // Keep the fixed height: find the most items that fit (at least one).
        const total = truncate(this.#validate(t, data, '') as never, Number.MAX_SAFE_INTEGER).total;
        const attempt = async (keep: number) => {
          const d = await this.#html(templateId, data, opts, keep);
          await show(d.html);
          return { doc: d, fit: await settle(), keep };
        };
        type Attempt = Awaited<ReturnType<typeof attempt>>;
        let best: Attempt | null = null;
        let last: Attempt | null = null;
        let lo = 1;
        let hi = total - 1;
        for (let tries = 0; lo <= hi && tries < MAX_CAP_TRIES; tries++) {
          last = await attempt(Math.floor((lo + hi + 1) / 2));
          if (last.fit.tooTall) hi = last.keep - 1;
          else {
            best = last;
            lo = last.keep + 1;
          }
        }
        // Nothing fit, not even one item: show one and grow as usual.
        if (!best && total > 1) best = last?.keep === 1 ? last : (last = await attempt(1));
        if (best) {
          // The page shows the last attempt; go back to the best one.
          if (best !== last) best = await attempt(best.keep);
          doc = best.doc;
          fit = best.fit;
        }
      }
      let scaled: number | undefined;
      if ((fit.tooTall || fit.grewWidth) && opts.overflow === 'cap' && doc.height != null) {
        // Still too big (no truncate, or one item is): shrink the content to fit (see shrink.ts).
        scaled = await this.#shrink(page, doc, () => show(doc.html));
        if (scaled) fit = await settle();
        else {
          // Not even at the floor: grow as before, from a fresh page.
          await show(doc.html);
          fit = await settle();
        }
      }
      const width = Math.min(MAX_PIXELS, fit.width);
      const height = Math.min(MAX_AUTO_HEIGHT, Math.max(1, fit.height));
      const adjusted =
        fit.grewWidth || fit.grewHeight
          ? { ...(fit.grewWidth ? { width: [doc.width, width] as [number, number] } : {}), ...(fit.grewHeight ? { height: [doc.height!, height] as [number, number] } : {}) }
          : undefined;
      // A round screen: content smaller than the inscribed square sits in its middle.
      if (doc.circle && !adjusted) await page.evaluate(centreContent);
      await page.setViewportSize({ width, height });
      return fn(page, doc, { width, height, adjusted, capped: doc.capped, scaled: scaled && scaled < 1 ? scaled : undefined });
    });
  }

  /**
   * Finds the largest factor (SCALE_FLOOR to 1) at which the page's content
   * fits its fixed box, and leaves the page shrunk to it. Undefined when even
   * the floor overflows. `reload` restores the unshrunk page.
   */
  async #shrink(page: Page, doc: HtmlResult & { circle?: boolean }, reload: () => Promise<void>): Promise<number | undefined> {
    await reload();
    const measure = async (s: number) => {
      await page.evaluate(scaleContent, s);
      const round = doc.circle ? await page.evaluate(circleLayout) : { fits: true };
      const m = await page.evaluate(measureFit);
      return { ...m, fits: !m.over && round.fits };
    };
    // Largest factor known to fit, smallest known not to.
    let lo = 0;
    let hi = 1;
    let s = 1;
    for (let tries = 0; tries < MAX_SCALE_TRIES; tries++) {
      const m = await measure(s);
      if (m.fits) lo = s;
      else hi = s;
      if (hi - lo < 0.01 || (!m.fits && s <= SCALE_FLOOR)) break;
      // Content scales with the factor (plus some re-wrapping): aim at the box, staying between the bounds.
      const aim = s * Math.min(m.boxW / m.needW, m.boxH / m.needH) * (m.fits ? 1 : 0.99);
      const next = Math.round(Math.max(SCALE_FLOOR, Math.min(1, aim)) * 1000) / 1000;
      s = next > lo && next < hi ? next : Math.round(((Math.max(lo, SCALE_FLOOR) + hi) / 2) * 1000) / 1000;
    }
    if (!lo) return undefined;
    // The page shows the last factor tried; go back to the best one.
    if (s !== lo) await measure(lo);
    return lo;
  }

  /** Renders a template to an image. */
  async render(templateId: string, data: unknown, options: RenderOptions = {}): Promise<RenderResult> {
    const opts = this.#options(options);
    const format = opts.format ?? 'png';
    const scale = opts.scale ?? 2;
    return this.#load(templateId, data, opts, async (page, doc, size) => {
      // Keep the bitmap within what image-consuming models accept: very large
      // outputs fall back to one bitmap pixel per CSS pixel.
      const fits = size.width * scale <= MAX_PIXELS && size.height * scale <= MAX_PIXELS;
      const image = await page.screenshot({
        type: format,
        quality: format === 'jpeg' ? (opts.quality ?? 90) : undefined,
        omitBackground: format === 'png' && !!opts.transparent,
        scale: fits ? 'device' : 'css',
        animations: 'disabled',
        caret: 'hide',
      });
      return {
        template: templateId,
        data: image,
        mimeType: format === 'jpeg' ? 'image/jpeg' : 'image/png',
        width: size.width,
        height: size.height,
        scale: fits ? scale : 1,
        detail: doc.detail,
        adjusted: size.adjusted,
        capped: size.capped,
        ...(size.scaled ? { scaled: size.scaled } : {}),
      };
    });
  }

  /** Lists any text that would be clipped, cut short or pushed outside the image. */
  async audit(templateId: string, data: unknown, options: RenderOptions = {}): Promise<OverflowIssue[]> {
    return this.#load(templateId, data, { scale: 1, ...options }, (page) => page.evaluate(auditOverflow));
  }

  close(): Promise<void> {
    return this.browser.close();
  }
}
