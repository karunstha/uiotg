/**
 * Optional photo backgrounds from free stock-photo APIs. Off unless a key is
 * configured; every template falls back to generated art (core/art.ts).
 *
 *   UIOTG_UNSPLASH_ACCESS_KEY  https://unsplash.com/developers (free)
 *   UIOTG_PEXELS_API_KEY       https://www.pexels.com/api/ (free)
 *
 * Unsplash rules followed: images are hotlinked from the returned URLs and the
 * download endpoint is pinged when a photo is used. The photographer credit is
 * kept on `Photo` but not drawn on the image.
 */

export interface Photo {
  url: string;
  credit: string;
}

const UNSPLASH = process.env.UIOTG_UNSPLASH_ACCESS_KEY;
const PEXELS = process.env.UIOTG_PEXELS_API_KEY;
const OFFLINE = process.env.UIOTG_OFFLINE === '1';
const TTL = 6 * 3600_000;
const cache = new Map<string, { at: number; photo: Photo | null }>();

export function photosEnabled(): boolean {
  return !OFFLINE && !!(UNSPLASH || PEXELS);
}

function pick<T>(items: T[], query: string): T | undefined {
  if (!items.length) return undefined;
  let h = 0;
  for (const c of query) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  // Stable per query but not always the top result, so cards don't all look alike.
  return items[h % Math.min(items.length, 6)];
}

async function unsplash(query: string, orientation: string): Promise<Photo | null> {
  const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=10&orientation=${orientation}&content_filter=high`;
  const res = await fetch(url, { headers: { Authorization: `Client-ID ${UNSPLASH}`, 'Accept-Version': 'v1' }, signal: AbortSignal.timeout(4000) });
  if (!res.ok) return null;
  const body = (await res.json()) as { results: Array<{ urls: { raw: string }; user: { name: string }; links: { download_location: string } }> };
  const hit = pick(body.results, query);
  if (!hit) return null;
  // Required by the Unsplash API guidelines when a photo is used.
  void fetch(hit.links.download_location, { headers: { Authorization: `Client-ID ${UNSPLASH}` }, signal: AbortSignal.timeout(4000) }).catch(() => {});
  return { url: `${hit.urls.raw}&w=1600&q=80&fit=crop&auto=format`, credit: `Photo: ${hit.user.name} / Unsplash` };
}

async function pexels(query: string, orientation: string): Promise<Photo | null> {
  const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=10&orientation=${orientation === 'squarish' ? 'square' : orientation}`;
  const res = await fetch(url, { headers: { Authorization: PEXELS! }, signal: AbortSignal.timeout(4000) });
  if (!res.ok) return null;
  const body = (await res.json()) as { photos: Array<{ src: { large2x: string }; photographer: string }> };
  const hit = pick(body.photos, query);
  return hit ? { url: hit.src.large2x, credit: `Photo: ${hit.photographer} / Pexels` } : null;
}

/** A relevant photo for `query`, or null (no key, offline, nothing found, or an error). */
export async function findPhoto(query: string, orientation: 'landscape' | 'portrait' | 'squarish' = 'landscape'): Promise<Photo | null> {
  if (!photosEnabled() || !query.trim()) return null;
  const key = `${orientation}:${query.trim().toLowerCase()}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.photo;
  let photo: Photo | null = null;
  try {
    photo = UNSPLASH ? await unsplash(query, orientation) : await pexels(query, orientation);
  } catch {
    photo = null;
  }
  cache.set(key, { at: Date.now(), photo });
  return photo;
}
