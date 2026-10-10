import { z } from 'zod';
import type { Art } from './art.ts';
import { imageUrlSchema } from './format.ts';
import { html, raw, style, type Html } from './html.ts';
import { findPhoto } from './photos.ts';
import { imageBackground } from './ui.ts';

export const backgroundFields = {
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
  query?: string;
  art: () => Art;
  orientation?: 'landscape' | 'portrait' | 'squarish';
}): Promise<Backdrop | null> {
  if (opts.mode === 'none') return null;
  let url = opts.url;
  if (!url && opts.mode !== 'art' && opts.query) {
    const photo = await findPhoto(opts.query, opts.orientation);
    if (photo) url = photo.url;
  }
  if (url) {
    return {
      photo: true,
      ink: '#ffffff',
      layer: html`<div class="bk bg-img" style="${style({ 'background-image': imageBackground(url, opts.query ?? url) })}"></div><div class="bk-scrim"></div>`,
    };
  }
  const art = opts.art();
  return { photo: false, ink: art.ink, layer: html`<div class="bk" style="${style({ background: art.background })}">${raw(art.overlay)}</div>` };
}
