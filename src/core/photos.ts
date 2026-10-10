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
/** Misses and errors (rate limits, timeouts) are retried sooner than hits. */
const MISS_TTL = 10 * 60_000;
/** Each render picks at random from this many top results, so repeat cards vary. */
const POOL = 10;

interface Candidate extends Photo {
  /** Unsplash download endpoint, pinged each time the photo is used. */
  ping?: string;
}

const cache = new Map<string, { at: number; photos: Candidate[] }>();

export function photosEnabled(): boolean {
  return !OFFLINE && !!(UNSPLASH || PEXELS);
}

async function unsplash(query: string, orientation: string): Promise<Candidate[]> {
  const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=${POOL}&orientation=${orientation}&content_filter=high`;
  const res = await fetch(url, { headers: { Authorization: `Client-ID ${UNSPLASH}`, 'Accept-Version': 'v1' }, signal: AbortSignal.timeout(4000) });
  if (!res.ok) return [];
  const body = (await res.json()) as { results: Array<{ urls: { raw: string }; user: { name: string }; links: { download_location: string } }> };
  return body.results.map((hit) => ({
    url: `${hit.urls.raw}&w=1600&q=80&fit=crop&auto=format`,
    credit: `Photo: ${hit.user.name} / Unsplash`,
    ping: hit.links.download_location,
  }));
}

async function pexels(query: string, orientation: string): Promise<Candidate[]> {
  const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=${POOL}&orientation=${orientation === 'squarish' ? 'square' : orientation}`;
  const res = await fetch(url, { headers: { Authorization: PEXELS! }, signal: AbortSignal.timeout(4000) });
  if (!res.ok) return [];
  const body = (await res.json()) as { photos: Array<{ src: { large2x: string }; photographer: string }> };
  return body.photos.map((hit) => ({ url: hit.src.large2x, credit: `Photo: ${hit.photographer} / Pexels` }));
}

/** A random relevant photo for `query`, or null (no key, offline, nothing found, or an error). */
export async function findPhoto(query: string, orientation: 'landscape' | 'portrait' | 'squarish' = 'landscape'): Promise<Photo | null> {
  if (!photosEnabled() || !query.trim()) return null;
  const key = `${orientation}:${query.trim().toLowerCase()}`;
  let entry = cache.get(key);
  if (!entry || Date.now() - entry.at >= (entry.photos.length ? TTL : MISS_TTL)) {
    let photos: Candidate[] = [];
    try {
      photos = UNSPLASH ? await unsplash(query, orientation) : await pexels(query, orientation);
    } catch {
      photos = [];
    }
    entry = { at: Date.now(), photos };
    cache.set(key, entry);
  }
  const hit = entry.photos[Math.floor(Math.random() * entry.photos.length)];
  if (!hit) return null;
  // Required by the Unsplash API guidelines each time a photo is used.
  if (hit.ping) void fetch(hit.ping, { headers: { Authorization: `Client-ID ${UNSPLASH}` }, signal: AbortSignal.timeout(4000) }).catch(() => {});
  return { url: hit.url, credit: hit.credit };
}
