/**
 * Runs inside the page (serialized by Playwright, so it must be self-contained).
 * Finds text that isn't fully visible:
 *   - "ellipsis": cut short by text-overflow
 *   - "clipped":  extends past an ancestor that hides overflow
 *   - "outside":  extends past the image itself
 *   - "escapes-plot": a chart label drawn outside its SVG plot area
 *   - "overlap":  two chart labels drawn on top of each other
 * Covers HTML text and SVG <text> (chart labels).
 */
export interface OverflowIssue {
  problem: 'ellipsis' | 'clipped' | 'outside' | 'escapes-plot' | 'overlap' | 'broken-number';
  element: string;
  text: string;
}

export function auditOverflow(): OverflowIssue[] {
  const root = document.getElementById('root');
  if (!root) return [];
  const issues: OverflowIssue[] = [];
  const tol = 1.5;
  const describe = (el: Element) => `${el.tagName.toLowerCase()}${el.classList.length ? `.${[...el.classList].join('.')}` : ''}`;
  const beyond = (r: DOMRect, b: DOMRect) => r.right > b.right + tol || r.left < b.left - tol || r.bottom > b.bottom + tol || r.top < b.top - tol;

  const check = (el: Element, rect: DOMRect, text: string) => {
    if (rect.width === 0 && rect.height === 0) return;
    let a: Element | null = el.parentElement;
    while (a && a !== document.body) {
      const s = getComputedStyle(a);
      if (s.overflowX !== 'visible' || s.overflowY !== 'visible') {
        if (beyond(rect, a.getBoundingClientRect())) {
          issues.push({ problem: a === root ? 'outside' : 'clipped', element: describe(el), text: text.slice(0, 80) });
          return;
        }
      }
      a = a.parentElement;
    }
  };

  for (const el of root.querySelectorAll('*')) {
    if (el instanceof SVGElement && el.tagName.toLowerCase() !== 'text') continue;
    const own = [...el.childNodes].filter((n) => n.nodeType === Node.TEXT_NODE && n.textContent!.trim());
    if (!own.length) continue;
    const text = own.map((n) => n.textContent!.trim()).join(' ');
    if (el instanceof HTMLElement && getComputedStyle(el).textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth + 1) {
      issues.push({ problem: 'ellipsis', element: describe(el), text: text.slice(0, 80) });
      continue;
    }
    for (const node of own) {
      const range = document.createRange();
      range.selectNodeContents(node);
      check(el, range.getBoundingClientRect(), text);
      // A number (e.g. "$1,234,567.89", "−12.5%", "212 ms") split across lines.
      const t = node.textContent!.trim();
      // (Code is exempt: long code lines may wrap at any character.)
      if (/^[+−\-]?[$€£¥]?[\d][\d,.:]*\s?[%A-Za-z°]{0,3}$/.test(t) && !el.closest('pre, code')) {
        const tops = new Set([...range.getClientRects()].map((r) => Math.round(r.top)));
        if (tops.size > 1) issues.push({ problem: 'broken-number', element: describe(el), text: t });
      }
    }
  }
  // Chart labels: must stay inside their plot and must not sit on top of each other.
  const labels = [...root.querySelectorAll('svg text')]
    .map((el) => ({ el, rect: el.getBoundingClientRect(), text: (el.textContent ?? '').trim() }))
    .filter((l) => l.text && l.rect.width > 0);
  for (const l of labels) {
    const svg = (l.el as SVGTextElement).ownerSVGElement;
    if (svg && beyond(l.rect, svg.getBoundingClientRect())) issues.push({ problem: 'escapes-plot', element: 'svg text', text: l.text.slice(0, 80) });
  }
  for (let i = 0; i < labels.length; i++)
    for (let j = i + 1; j < labels.length; j++) {
      const a = labels[i]!.rect;
      const b = labels[j]!.rect;
      const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (w > 3 && h > 4 && w * h > 0.35 * Math.min(a.width * a.height, b.width * b.height))
        issues.push({ problem: 'overlap', element: 'svg text', text: `${labels[i]!.text.slice(0, 40)} ↔ ${labels[j]!.text.slice(0, 40)}` });
    }
  return issues;
}

/**
 * Last line of defense, also in-page: if content is wider than the image or
 * taller than a fixed height, grow the root instead of clipping.
 */
export function growToFit(): { width: number; height: number; grewWidth: boolean; grewHeight: boolean } {
  const root = document.getElementById('root')!;
  let grewWidth = false;
  let grewHeight = false;
  if (root.scrollWidth > root.clientWidth + 1) {
    root.style.maxWidth = 'none';
    root.style.width = `${root.scrollWidth}px`;
    grewWidth = true;
  }
  if (root.style.height && root.scrollHeight > root.clientHeight + 1) {
    root.style.height = `${root.scrollHeight}px`;
    grewHeight = true;
  }
  const r = root.getBoundingClientRect();
  return { width: Math.ceil(r.width), height: Math.floor(r.height), grewWidth, grewHeight };
}
