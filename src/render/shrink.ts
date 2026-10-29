/**
 * Overflow "cap" for templates that can't show fewer items (no `truncate`, or
 * one item is still too big): shrink the content uniformly instead of growing
 * the image. The root's content (not the photo layers) moves into one wrapper
 * that is laid out `1/s` times wider, so text re-wraps as on a bigger canvas,
 * and then zoomed by `s`. The renderer searches for the largest `s` that fits
 * (see Renderer #load); below SCALE_FLOOR the image grows as before.
 */

/** Smallest factor content shrinks to; smaller text is unreadable on a small screen. */
export const SCALE_FLOOR = 0.6;

/** Class of the wrapper the in-page passes put the root's content in. */
export const FIT_WRAP = 'fit-wrap';

/**
 * In-page (serialized by Playwright, so self-contained). Wraps the root's
 * content once, then lays it out at the content box width divided by `s` and
 * zooms it by `s`. Circle rows lose their chord widths: run circleLayout after.
 */
export function scaleContent(s: number): void {
  const root = document.getElementById('root')!;
  let wrap = root.querySelector<HTMLElement>(':scope > .fit-wrap');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.className = 'fit-wrap';
    for (const n of [...root.childNodes]) if (!(n instanceof Element && n.matches('.bk, .bk-scrim'))) wrap.append(n);
    root.append(wrap);
  }
  const cs = getComputedStyle(root);
  const boxW = root.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  wrap.style.flex = 'none';
  wrap.style.width = `${boxW / s}px`;
  wrap.style.zoom = String(s);
  for (const row of root.querySelectorAll<HTMLElement>('.circle-row')) row.style.maxWidth = '';
}

/**
 * In-page. How much room the content needs against the root's content box, in
 * image px, and whether it overflows the way growToFit would see it.
 */
export function measureFit(): { boxW: number; boxH: number; needW: number; needH: number; over: boolean } {
  const root = document.getElementById('root')!;
  const cs = getComputedStyle(root);
  const [l, r, t, b] = [cs.paddingLeft, cs.paddingRight, cs.paddingTop, cs.paddingBottom].map(parseFloat) as [number, number, number, number];
  const boxW = root.clientWidth - l - r;
  const boxH = root.clientHeight - t - b;
  const wide = root.scrollWidth > root.clientWidth + 1;
  const tall = root.scrollHeight > root.clientHeight + 1;
  // Content that fits: the wrapper's height says how much room is left.
  const wrap = root.querySelector(':scope > .fit-wrap');
  const fitH = wrap ? wrap.getBoundingClientRect().height : boxH;
  // Scrollable overflow counts the bottom padding but not the right one.
  return { boxW, boxH, needW: wide ? root.scrollWidth - l : boxW, needH: tall ? root.scrollHeight - t - b : fitH, over: wide || tall };
}
