import { readFileSync } from 'node:fs';
import { ASSET_ORIGIN } from './fonts.ts';

/**
 * Map tiles are fetched by the server, not the page: we identify ourselves
 * with a real User-Agent (required by OpenStreetMap's tile policy), cache
 * tiles in memory so repeated renders don't refetch, and keep the provider in
 * one place. Override with UIOTG_TILE_URL ({z}/{x}/{y}, optional {s}, {r}) for
 * a keyed provider (MapTiler, Stadia, Mapbox…) in production.
 */
const TILE_URL = process.env.UIOTG_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
export const TILE_ATTRIBUTION = process.env.UIOTG_TILE_ATTRIBUTION || '© OpenStreetMap contributors';
/** True when tiles come from the default provider, whose single light style we restyle for dark mode. */
export const DEFAULT_TILES = !process.env.UIOTG_TILE_URL;

const VERSION: string = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version;
// OSM asks operators to be reachable: set UIOTG_TILE_CONTACT to an email or URL when hosting.
const CONTACT = process.env.UIOTG_TILE_CONTACT;
const USER_AGENT = `uiotg/${VERSION} (MCP UI renderer${CONTACT ? `; ${CONTACT}` : ''})`;

const MAX_CACHED = 2000;
const cache = new Map<string, Buffer>();
const inflight = new Map<string, Promise<Buffer | undefined>>();

/** URL the page requests for a tile; served by the browser route from `fetchTile`. */
export function tileHref(z: number, x: number, y: number): string {
  return `${ASSET_ORIGIN}/tiles/${z}/${x}/${y}.png`;
}

function upstream(z: number, x: number, y: number): string {
  return TILE_URL.replace('{s}', 'abc'[(x + y) % 3]!)
    .replace('{z}', String(z))
    .replace('{x}', String(x))
    .replace('{y}', String(y))
    .replace('{r}', '@2x');
}

/** Tile bytes for `/tiles/z/x/y.png`, from cache or upstream; undefined on failure. */
export function fetchTile(pathname: string): Promise<Buffer | undefined> {
  const m = /^\/tiles\/(\d{1,2})\/(\d+)\/(\d+)\.png$/.exec(pathname);
  if (!m) return Promise.resolve(undefined);
  const key = `${m[1]}/${m[2]}/${m[3]}`;
  const hit = cache.get(key);
  if (hit) {
    // Refresh recency for LRU eviction.
    cache.delete(key);
    cache.set(key, hit);
    return Promise.resolve(hit);
  }
  let pending = inflight.get(key);
  if (!pending) {
    pending = fetch(upstream(Number(m[1]), Number(m[2]), Number(m[3])), {
      headers: { 'user-agent': USER_AGENT },
      signal: AbortSignal.timeout(8_000),
    })
      .then(async (res) => (res.ok ? Buffer.from(await res.arrayBuffer()) : undefined))
      .catch(() => undefined)
      .then((buf) => {
        inflight.delete(key);
        if (buf) {
          cache.set(key, buf);
          if (cache.size > MAX_CACHED) cache.delete(cache.keys().next().value!);
        }
        return buf;
      });
    inflight.set(key, pending);
  }
  return pending;
}
