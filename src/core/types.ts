import type { z } from 'zod';
import type { Html } from './html.ts';
import type { Theme } from './theme.ts';

export type Category = 'basic' | 'text' | 'data' | 'chart' | 'media' | 'layout';

export const CATEGORIES: Record<Category, string> = {
  basic: 'Basic elements',
  text: 'Text & content',
  data: 'Data & status',
  chart: 'Charts',
  media: 'Media & cards',
  layout: 'Layout',
};

export interface Size {
  /** Content-box width in CSS pixels. */
  width: number;
  /** Content-box height in CSS pixels, when the output has a fixed height. */
  height?: number;
}

/** How much a template shows: just the essentials, the default, or extra context derived from the data. */
export type Detail = 'minimal' | 'standard' | 'rich';

export interface RenderContext extends Size {
  theme: Theme;
  /** Resolved level of detail (see Template.richWhen). Templates may ignore it. */
  detail: Detail;
  /**
   * Renders another template as a fragment inside this one (used by layout
   * templates). `path` prefixes validation errors, e.g. "blocks[2].data".
   */
  renderBlock(template: string, data: unknown, size: Size, path: string): Promise<Html>;
  /**
   * Renders another template inline at this size (no block wrapper), e.g. a
   * chart degrading to a stat tile when there's too little data for a chart.
   */
  include(template: string, data: unknown): Promise<Html>;
}

export interface Template<S extends z.ZodType = z.ZodType> {
  id: string;
  title: string;
  category: Category;
  /** A few words on when to pick it, for the compact catalog (e.g. "trend over time"). */
  summary: string;
  /** When to pick this template, written for the calling model. */
  description: string;
  schema: S;
  /** Representative input; used by docs, the gallery and tests. */
  example: z.input<S>;
  /** Default output width in CSS px (may depend on the data). */
  width: number | ((data: z.output<S>) => number);
  /** Default fixed height; omitted means the image fits its content. */
  height?: number;
  /**
   * "content": the image shrink-wraps to its content (up to `width`) instead of
   * always using the full width, so a one-line list isn't a wide empty card.
   */
  fit?: 'content';
  /** Narrowest the image may shrink to with fit "content" (default 280). */
  minWidth?: number;
  /** Frame padding in CSS px (default 32). Full-bleed templates use 0. */
  padding?: number;
  /**
   * How the template sits inside a layout block: on a padded surface card
   * (default), or "bare" when it draws its own cards (e.g. stat tiles).
   */
  embed?: 'card' | 'bare';
  /** Frame background: the card surface (default) or the darker page plane. */
  background?: 'surface' | 'plane';
  /**
   * Opt in to the "rich" detail level: with detail "auto", rich is used when
   * there's room and this returns true for the data (e.g. enough points for a
   * summary to say something).
   */
  richWhen?: (data: z.output<S>) => boolean;
  /**
   * Accepts a photo behind the whole card (see core/backdrop.ts `photoSchema`),
   * when a photo API key is set. "keyword": only when the caller passes
   * `background_image_query_keyword`. "title": that, else the card's title or
   * label — for single-subject cards where the title names the subject.
   */
  photo?: 'keyword' | 'title';
  /** Stylesheet included once per document when the template is used. */
  css?: string;
  render(data: z.output<S>, ctx: RenderContext): Html | Promise<Html>;
}

export function defineTemplate<S extends z.ZodType>(template: Template<S>): Template<S> {
  return template;
}
