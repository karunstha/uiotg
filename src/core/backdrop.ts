import { z } from 'zod';
import type { Art } from './art.ts';
import { imageUrlSchema } from './format.ts';
import { html, raw, style, type Html } from './html.ts';
import { findPhoto } from './photos.ts';
import { imageBackground } from './ui.ts';

/** Field name for the photo search keyword, shared by every template that takes a photo. */
export const QUERY_FIELD = 'background_image_query_keyword';

const queryField = z.string().trim().min(1).max(80).optional().describe('Photo search for the background, e.g. "christmas" or "tokyo night"');

export const backgroundFields = {
  [QUERY_FIELD]: queryField,
  background: z
    .enum(['auto', 'art', 'photo', 'none'])
    .default('auto')
    .describe('"auto": a relevant photo when a photo API key is configured, otherwise generated art; "art", "photo" or "none" to force'),
  background_url: imageUrlSchema.optional().describe('Use this image as the background instead'),
};

export interface Backdrop {
  layer: Html;
  ink: string;
  photo: boolean;
}

/**
 * Resolves a background: an explicit URL, a searched photo, or generated art.
 * Photos get a scrim so white text stays readable.
 */
export async function backdrop(opts: {
  mode: 'auto' | 'art' | 'photo' | 'none';
  url?: string;
  /** Search terms tried in order until one finds a photo. */
  query?: string | string[];
  art: () => Art;
  orientation?: 'landscape' | 'portrait' | 'squarish';
}): Promise<Backdrop | null> {
  if (opts.mode === 'none') return null;
  let url = opts.url;
  const queries = [opts.query ?? []].flat();
  if (!url && opts.mode !== 'art') {
    for (const q of queries) {
      url = (await findPhoto(q, opts.orientation))?.url;
      if (url) break;
    }
  }
  if (url) {
    return {
      photo: true,
      ink: '#ffffff',
      layer: html`<div class="bk bg-img" style="${style({ 'background-image': imageBackground(url, queries[0] ?? url) })}"></div><div class="bk-scrim"></div>`,
    };
  }
  const art = opts.art();
  return { photo: false, ink: art.ink, layer: html`<div class="bk" style="${style({ background: art.background })}">${raw(art.overlay)}</div>` };
}

/** Background fields accepted by every template with `photo` set (read by the renderer, not the template). */
export const photoSchema = z.object({
  background: z.enum(['auto', 'none']).default('auto').describe('"auto": a photo when a photo API key is configured and there is something to search for; "none" for a plain card'),
  [QUERY_FIELD]: queryField,
  background_url: imageUrlSchema.optional().describe('Use this image as the background instead'),
});
export type PhotoOptions = z.output<typeof photoSchema>;

/**
 * What to search for: the explicit keyword, else (only for single-subject
 * cards, photo "title") the card's title or label. Null means a plain card.
 */
export function photoQuery(opts: PhotoOptions, data: Record<string, unknown>, mode: 'keyword' | 'title'): string | null {
  if (opts.background === 'none') return null;
  const keyword = opts[QUERY_FIELD];
  if (keyword) return keyword;
  if (mode !== 'title') return null;
  for (const k of ['title', 'label']) {
    const v = data[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}

/** The photo URL for a whole-card background, or null for a plain card. */
export async function framePhoto(opts: PhotoOptions, data: Record<string, unknown>, mode: 'keyword' | 'title'): Promise<string | null> {
  if (opts.background === 'none') return null;
  if (opts.background_url) return opts.background_url;
  const query = photoQuery(opts, data, mode);
  return query ? ((await findPhoto(query))?.url ?? null) : null;
}
