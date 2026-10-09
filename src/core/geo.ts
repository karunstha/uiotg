/** Web Mercator helpers for placing raster tiles and overlays without a map library. */

export const TILE = 256;

export interface LatLon {
  lat: number;
  lon: number;
}

/** World pixel coordinates of a point at zoom `z`. */
export function project(p: LatLon, z: number): { x: number; y: number } {
  const scale = TILE * 2 ** z;
  const lat = Math.max(-85.05112878, Math.min(85.05112878, p.lat));
  const s = Math.sin((lat * Math.PI) / 180);
  return {
    x: ((p.lon + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * scale,
  };
}

export interface Viewport {
  zoom: number;
  /** World pixel of the viewport's top-left corner. */
  originX: number;
  originY: number;
  width: number;
  height: number;
}

/**
 * Picks the highest zoom at which every point fits inside the viewport with
 * `pad` px to spare, centered on their bounds. A lone point gets `singleZoom`.
 */
export function fitViewport(points: LatLon[], width: number, height: number, pad: number, maxZoom = 16, singleZoom = 14): Viewport {
  let zoom = singleZoom;
  if (points.length > 1) {
    zoom = 1;
    for (let z = maxZoom; z >= 1; z--) {
      const px = points.map((p) => project(p, z));
      const w = Math.max(...px.map((p) => p.x)) - Math.min(...px.map((p) => p.x));
      const h = Math.max(...px.map((p) => p.y)) - Math.min(...px.map((p) => p.y));
      if (w <= width - pad * 2 && h <= height - pad * 2) {
        zoom = z;
        break;
      }
    }
  }
  const px = points.map((p) => project(p, zoom));
  const cx = (Math.max(...px.map((p) => p.x)) + Math.min(...px.map((p) => p.x))) / 2;
  const cy = (Math.max(...px.map((p) => p.y)) + Math.min(...px.map((p) => p.y))) / 2;
  return { zoom, originX: cx - width / 2, originY: cy - height / 2, width, height };
}

export function centeredViewport(center: LatLon, zoom: number, width: number, height: number): Viewport {
  const c = project(center, zoom);
  return { zoom, originX: c.x - width / 2, originY: c.y - height / 2, width, height };
}

/** Tiles covering the viewport, with their position relative to its top-left corner. */
export function tilesFor(v: Viewport): Array<{ x: number; y: number; z: number; left: number; top: number }> {
  const n = 2 ** v.zoom;
  const tiles = [];
  for (let ty = Math.floor(v.originY / TILE); ty <= Math.floor((v.originY + v.height) / TILE); ty++) {
    if (ty < 0 || ty >= n) continue;
    for (let tx = Math.floor(v.originX / TILE); tx <= Math.floor((v.originX + v.width) / TILE); tx++) {
      tiles.push({ x: ((tx % n) + n) % n, y: ty, z: v.zoom, left: tx * TILE - v.originX, top: ty * TILE - v.originY });
    }
  }
  return tiles;
}

/** Point position inside the viewport. */
export function toScreen(p: LatLon, v: Viewport): { x: number; y: number } {
  const w = project(p, v.zoom);
  return { x: w.x - v.originX, y: w.y - v.originY };
}
