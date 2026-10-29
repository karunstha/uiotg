/**
 * Shape "circle": a round screen of diameter D = min(width, height) centred in
 * the image. The renderer insets the root to the circle (minus CIRCLE_RIM) and
 * writes the geometry to the root as `--circle: cx cy R rim padX` (CSS px,
 * relative to the root's top-left; R is the full radius D/2).
 *
 * Templates with `circle: "rows"` get a centred column, and circleLayout()
 * (in-page) narrows every CIRCLE_ROW element to the circle's chord at its edge
 * farthest from the centre. Other templates get the square inside the circle.
 */

/** Gap kept between the visible edge of the circle and any content, in CSS px. */
export const CIRCLE_RIM = 8;

/** CSS for shape "circle" (the root carries `shape-circle` and `circle-rows` or `circle-square`). */
export const CIRCLE_CSS = `
#root.circle-rows{display:flex;flex-direction:column;justify-content:safe center;text-align:center}
.circle-rows .circle-row{margin-inline:auto}
:where(.circle-rows .circle-row){width:100%}
.circle-rows .hdr{flex-direction:column;align-items:stretch;gap:4px}
.circle-rows .hdr-sub{margin-top:0}
.circle-rows .hdr-aside{max-width:none;text-align:center}
.circle-rows .ls-bullet{display:none}
`;

export interface CircleBox {
  /** Inset from the image edge to the content box, per axis. */
  inset: { x: number; y: number };
  /** Content size the template lays out in. */
  width: number;
  height: number;
  /** Value of the root's `--circle` property. */
  vars: string;
}

/**
 * Where content goes for shape "circle". `rows`: the box spans the circle's
 * full safe diameter (rows are narrowed in the page); otherwise the inscribed
 * square. Padding always adds to the circle inset.
 */
export function circleBox(width: number, height: number, pad: { x: number; y: number }, rows: boolean): CircleBox {
  const d = Math.min(width, height);
  const safe = d - CIRCLE_RIM * 2;
  const side = rows ? safe : Math.floor(safe / Math.SQRT2);
  const inset = { x: (width - side) / 2 + pad.x, y: (height - side) / 2 + pad.y };
  return {
    inset,
    width: Math.max(0, side - pad.x * 2),
    height: Math.max(0, side - pad.y * 2),
    vars: `${width / 2} ${height / 2} ${d / 2} ${CIRCLE_RIM} ${pad.x}`,
  };
}

/**
 * In-page (serialized by Playwright, so self-contained). For a `circle-rows`
 * root, narrows each `.circle-row` to the chord at its outer edge, repeating
 * while wrapping moves rows. `fits` is false when a row's content is wider
 * than its chord or a row still reaches outside the safe circle: overflow "cap"
 * then treats the attempt as too tall.
 */
export function circleLayout(): { passes: number; fits: boolean } {
  const root = document.getElementById('root');
  if (!root || !root.classList.contains('circle-rows')) return { passes: 0, fits: true };
  const [cx, cy, radius, rim, padX] = getComputedStyle(root).getPropertyValue('--circle').trim().split(/\s+/).map(Number) as [number, number, number, number, number];
  const r = radius - rim;
  const GAP = 2;
  const MAX_PASSES = 6;
  const rows = [...root.querySelectorAll<HTMLElement>('.circle-row')];
  const geometry = (row: HTMLElement) => {
    const box = root.getBoundingClientRect();
    const b = row.getBoundingClientRect();
    return {
      b,
      dy: Math.max(Math.abs(b.top - box.top - cy), Math.abs(b.bottom - box.top - cy)),
      dx: Math.abs((b.left + b.right) / 2 - box.left - cx),
      far: Math.max(Math.abs(b.left - box.left - cx), Math.abs(b.right - box.left - cx)),
    };
  };
  let passes = 0;
  while (passes < MAX_PASSES) {
    passes++;
    let changed = false;
    for (const row of rows) {
      const g = geometry(row);
      if (!g.b.width && !g.b.height) continue;
      // Below the circle: overflow, which growToFit/cap handle.
      if (g.dy >= r) continue;
      const half = Math.sqrt(r * r - g.dy * g.dy);
      const want = Math.max(0, Math.floor(2 * (half - padX - GAP - g.dx)));
      const cur = row.style.maxWidth ? parseFloat(row.style.maxWidth) : Infinity;
      // Only ever narrower, so the passes settle.
      if (want < cur - 0.5) {
        row.style.maxWidth = `${want}px`;
        changed = true;
      }
    }
    if (!changed) break;
  }
  const fits = rows.every((row) => {
    const g = geometry(row);
    if (!g.b.width && !g.b.height) return true;
    const inside = g.dy * g.dy + g.far * g.far <= (r + 1) * (r + 1);
    return inside && row.scrollWidth <= row.clientWidth + 1;
  });
  return { passes, fits };
}
