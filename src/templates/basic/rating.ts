import { z } from 'zod';
import { html, raw, style, type Html } from '../../core/html.ts';
import { defineTemplate } from '../../core/types.ts';

const STAR = 'M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z';

function stars(score: number, max: number, size: number, color: string, track: string): Html {
  return html`<span class="rt-stars">${Array.from({ length: max }, (_, i) => {
    const fill = Math.max(0, Math.min(1, score - i));
    return html`<span class="rt-star" style="${style({ width: size, height: size })}">
      ${raw(`<svg width="${size}" height="${size}" viewBox="0 0 24 24"><path d="${STAR}" fill="${track}" stroke="${track}" stroke-width="1.5" stroke-linejoin="round"/></svg>`)}
      <span class="rt-fill" style="${style({ width: `${(fill * 100).toFixed(1)}%` })}">${raw(
        `<svg width="${size}" height="${size}" viewBox="0 0 24 24"><path d="${STAR}" fill="${color}" stroke="${color}" stroke-width="1.5" stroke-linejoin="round"/></svg>`,
      )}</span>
    </span>`;
  })}</span>`;
}

export const rating = defineTemplate({
  id: 'rating',
  title: 'Rating',
  summary: 'star or score rating',
  category: 'basic',
  photo: 'keyword',
  description:
    'A star rating: big score, partially filled stars, review count and an optional per-star distribution. Use for reviews, app ratings, satisfaction and scores out of 5 (or 10).',
  schema: z
    .object({
      score: z.number().min(0),
      max: z.number().int().min(3).max(10).default(5),
      label: z.string().max(80).optional().describe('What is rated, e.g. a product name'),
      count: z.number().int().min(0).optional().describe('Number of ratings'),
      distribution: z.array(z.number().min(0)).optional().describe('Counts per star level, highest first (5★, 4★, … 1★)'),
      caption: z.string().max(160).optional(),
    })
    .refine((d) => d.score <= d.max, { message: 'score cannot exceed max', path: ['score'] })
    .refine((d) => !d.distribution || d.distribution.length === d.max, { message: 'distribution needs one count per star level', path: ['distribution'] }),
  example: {
    label: 'Aurora Wireless Headphones',
    score: 4.6,
    count: 12_840,
    distribution: [9_120, 2_310, 760, 290, 360],
  },
  width: (d) => (d.distribution ? 560 : 340),
  padding: 24,
  css: /* css */ `
.rt{display:flex;gap:32px;align-items:center}
.rt-label{font-size:14px;font-weight:600;color:var(--text-2);margin-bottom:6px}
.rt-score{font-size:52px;font-weight:700;letter-spacing:-0.04em;line-height:1;color:var(--text)}
.rt-score small{font-size:18px;font-weight:500;color:var(--muted);letter-spacing:0}
.rt-stars{display:flex;gap:3px;margin-top:10px}
.rt-star{position:relative;display:inline-block}
.rt-star svg{display:block}
.rt-fill{position:absolute;left:0;top:0;bottom:0;overflow:hidden}
.rt-count{font-size:13px;color:var(--text-2);margin-top:8px}
.rt-caption{font-size:12px;color:var(--muted);margin-top:4px}
.rt-dist{flex:1;display:flex;flex-direction:column;gap:7px}
.rt-row{display:grid;grid-template-columns:24px 1fr 38px;gap:10px;align-items:center;font-size:12px;color:var(--text-2);
  font-variant-numeric:tabular-nums}
.rt-bar{height:8px;border-radius:var(--pill);background:var(--subtle);overflow:hidden}
.rt-bar span{display:block;height:100%;border-radius:var(--pill)}
.rt-row b{font-weight:500;text-align:right}
`,
  render(d, ctx) {
    const gold = ctx.theme.series[3]!;
    const total = d.distribution?.reduce((a, b) => a + b, 0) ?? 0;
    return html`<div class="rt">
      <div>
        ${d.label ? html`<div class="rt-label">${d.label}</div>` : null}
        <div class="rt-score">${d.score.toFixed(1)}<small> / ${d.max}</small></div>
        ${stars(d.score, d.max, d.max > 5 ? 18 : 22, gold, ctx.theme.mode === 'dark' ? '#3d3c38' : ctx.theme.axis)}
        ${d.count != null ? html`<div class="rt-count">${d.count.toLocaleString('en-US')} ratings</div>` : null}
        ${d.caption ? html`<div class="rt-caption">${d.caption}</div>` : null}
      </div>
      ${d.distribution
        ? html`<div class="rt-dist">${d.distribution.map((n, i) => {
            const pct = total ? (n / total) * 100 : 0;
            return html`<div class="rt-row"><span>${d.max - i} ★</span><span class="rt-bar"><span style="${style({ width: `${pct.toFixed(1)}%`, background: gold })}"></span></span><b>${Math.round(pct)}%</b></div>`;
          })}</div>`
        : null}
    </div>`;
  },
});
