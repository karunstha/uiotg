import { z } from 'zod';
import { imageUrlSchema, titleFields } from '../../core/format.ts';
import { html, style } from '../../core/html.ts';
import { icon } from '../../core/icons.ts';
import { defineTemplate } from '../../core/types.ts';
import { fitColumns, header, imageBackground } from '../../core/ui.ts';

function columnsFor(n: number, requested?: number): number {
  if (requested) return requested;
  if (n <= 4) return n;
  if (n <= 9) return 3;
  if (n <= 16) return 4;
  return 5;
}

export const albumGrid = defineTemplate({
  id: 'album_grid',
  title: 'Album / cover grid',
  category: 'media',
  description:
    'A collage of square covers (albums, books, films, podcasts, products) with titles overlaid or below, optional rank and caption such as play counts. Use for "top albums this month", watchlists and galleries.',
  schema: z.object({
    ...titleFields,
    items: z
      .array(
        z.object({
          title: z.string().min(1).max(120),
          subtitle: z.string().max(120).optional().describe('Artist, author or director'),
          image_url: imageUrlSchema.optional(),
          caption: z.string().max(40).optional().describe('e.g. "142 plays"'),
        }),
      )
      .min(1)
      .max(50),
    columns: z.number().int().min(1).max(8).optional(),
    labels: z.enum(['overlay', 'below', 'none']).default('overlay'),
    ranked: z.boolean().default(false).describe('Number the items 1, 2, 3…'),
  }),
  example: {
    title: 'Top albums · September',
    subtitle: 'Your most played records this month',
    ranked: true,
    items: [
      { title: 'Midnight Transit', subtitle: 'The Night Lines', image_url: 'https://picsum.photos/seed/uiotg-a1/400/400', caption: '142 plays' },
      { title: 'Paper Oceans', subtitle: 'Mira Vale', image_url: 'https://picsum.photos/seed/uiotg-a2/400/400', caption: '118 plays' },
      { title: 'Low Orbit', subtitle: 'Static Bloom', image_url: 'https://picsum.photos/seed/uiotg-a3/400/400', caption: '97 plays' },
      { title: 'Golden Hour Radio', subtitle: 'Sunset District', image_url: 'https://picsum.photos/seed/uiotg-a4/400/400', caption: '81 plays' },
      { title: 'Field Notes', subtitle: 'Oskar Lind', caption: '76 plays' },
      { title: 'Velvet Static', subtitle: 'Hollow Pines', image_url: 'https://picsum.photos/seed/uiotg-a6/400/400', caption: '64 plays' },
    ],
  },
  width: (d) => {
    const cols = columnsFor(d.items.length, d.columns);
    return Math.min(1400, Math.max(280, cols * 220 + (cols - 1) * 10 + 64));
  },
  css: /* css */ `
.cg-grid{display:grid;gap:10px}
.cg-tile{position:relative;aspect-ratio:1;border-radius:8px;display:flex;flex-direction:column;justify-content:flex-end;
  color:rgba(255,255,255,.6)}
.cg-ph{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:16px;text-align:center}
.cg-ph-title{font-size:16px;font-weight:650;color:#fff;letter-spacing:-0.01em;text-shadow:0 1px 8px rgba(0,0,0,.25)}
.cg-scrim{margin-top:auto;padding:44px 12px 11px;border-radius:0 0 8px 8px;
  background:linear-gradient(180deg, transparent, rgba(0,0,0,.72));color:#fff}
/* Long titles make the tile taller rather than being cut off. */
.cg-t{font-size:14px;font-weight:650;line-height:1.25;letter-spacing:-0.005em}
.cg-s{font-size:12px;opacity:.82;margin-top:1px}
.cg-c{font-size:11px;opacity:.7;margin-top:3px;font-variant-numeric:tabular-nums}
.cg-rank{position:absolute;top:8px;left:8px;min-width:26px;height:26px;padding:0 7px;border-radius:999px;background:rgba(0,0,0,.6);
  color:#fff;font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center;font-variant-numeric:tabular-nums}
.cg-below{margin-top:8px}
.cg-below .cg-t{color:var(--text)}
.cg-below .cg-s{color:var(--text-2);opacity:1}
.cg-below .cg-c{color:var(--muted);opacity:1}
`,
  render(d, ctx) {
    const cols = fitColumns(columnsFor(d.items.length, d.columns), ctx.width, 130, 10);
    return html`${header(d)}<div class="cg-grid" style="${`grid-template-columns:repeat(${cols}, minmax(0, 1fr))`}">${d.items.map((it, i) => {
      const seed = `${it.subtitle ?? ''} ${it.title}`;
      const text = html`<div class="cg-t shrink">${it.title}</div>${it.subtitle ? html`<div class="cg-s shrink">${it.subtitle}</div>` : null}${
        it.caption ? html`<div class="cg-c">${it.caption}</div>` : null
      }`;
      return html`<div>
        <div class="cg-tile bg-img" style="${style({ 'background-image': imageBackground(it.image_url, seed) })}">
          ${it.image_url ? null : html`<div class="cg-ph">${icon('disc-3', { size: 40, strokeWidth: 1.25 })}${d.labels === 'overlay' ? null : html`<div class="cg-ph-title">${it.title}</div>`}</div>`}
          ${d.ranked ? html`<span class="cg-rank">${i + 1}</span>` : null}
          ${d.labels === 'overlay' ? html`<div class="cg-scrim">${text}</div>` : null}
        </div>
        ${d.labels === 'below' ? html`<div class="cg-below">${text}</div>` : null}
      </div>`;
    })}</div>`;
  },
});
