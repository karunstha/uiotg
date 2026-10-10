import { z } from 'zod';
import { imageUrlSchema } from '../../core/format.ts';
import { html, raw, style } from '../../core/html.ts';
import { icon } from '../../core/icons.ts';
import { defineTemplate } from '../../core/types.ts';
import { imageBackground } from '../../core/ui.ts';

const STAR = raw('<svg class="icon" width="18" height="18" viewBox="0 0 24 24" fill="#eda100" aria-hidden="true"><path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z"/></svg>');

const KIND = {
  movie: { label: 'Movie', icon: 'clapperboard' },
  show: { label: 'TV series', icon: 'tv' },
  book: { label: 'Book', icon: 'book-open' },
  game: { label: 'Game', icon: 'gamepad-2' },
  podcast: { label: 'Podcast', icon: 'podcast' },
} as const;

const WHERE = { movie: 'Streaming on', show: 'Streaming on', book: 'Available at', game: 'Available on', podcast: 'Listen on' } as const;

export const mediaCard = defineTemplate({
  id: 'media_card',
  title: 'Movie / book / show card',
  category: 'media',
  description:
    'A title card for a movie, TV series, book, game or podcast: poster or cover, year, creator, rating(s), runtime/pages/seasons, genres, summary, cast, where to watch, and reading or watching progress. Use for recommendations, reviews and "what is this?" answers.',
  schema: z.object({
    kind: z.enum(['movie', 'show', 'book', 'game', 'podcast']).default('movie'),
    title: z.string().min(1).max(160),
    year: z.union([z.number().int(), z.string().max(20)]).optional(),
    creator: z.string().max(120).optional().describe('Director, author, studio or host'),
    poster_url: imageUrlSchema.optional().describe('Poster or cover (2:3)'),
    backdrop_url: imageUrlSchema.optional().describe('Wide still for the background; defaults to the poster, blurred'),
    rating: z.number().min(0).optional().describe('Primary score'),
    rating_max: z.number().positive().default(10),
    rating_source: z.string().max(30).optional().describe('e.g. "IMDb", "Goodreads"'),
    ratings: z.array(z.object({ source: z.string().max(30), value: z.string().max(12) })).max(4).optional().describe('Extra scores, e.g. {source:"Rotten Tomatoes", value:"94%"}'),
    certification: z.string().max(10).optional().describe('e.g. "PG-13"'),
    length: z.string().max(30).optional().describe('Runtime, page count or seasons, e.g. "2h 46m", "412 pages", "3 seasons"'),
    genres: z.array(z.string().max(30)).max(6).optional(),
    summary: z.string().max(800).optional(),
    cast: z.array(z.string().max(60)).max(8).optional().describe('Cast or key people'),
    where: z.array(z.string().max(30)).max(6).optional().describe('Where to watch, read or play'),
    progress: z.number().min(0).max(1).optional().describe('How far through it, 0–1'),
    progress_label: z.string().max(40).optional().describe('e.g. "Page 210 of 412" or "S2 E5"'),
    status: z.string().max(30).optional().describe('e.g. "Watched", "Reading", "Want to read"'),
  }),
  example: {
    kind: 'movie',
    title: 'Dune: Part Two',
    year: 2024,
    creator: 'Denis Villeneuve',
    rating: 8.5,
    rating_source: 'IMDb',
    ratings: [{ source: 'Rotten Tomatoes', value: '92%' }],
    certification: 'PG-13',
    length: '2h 46m',
    genres: ['Sci-fi', 'Adventure'],
    summary: 'Paul Atreides unites with Chani and the Fremen while seeking revenge against the conspirators who destroyed his family.',
    cast: ['Timothée Chalamet', 'Zendaya', 'Rebecca Ferguson', 'Austin Butler'],
    where: ['Max', 'Apple TV'],
  },
  width: 760,
  padding: 0,
  css: /* css */ `
.mv{position:relative;overflow:hidden;isolation:isolate}
.mv-bg{position:absolute;inset:-80px;z-index:-2;background-size:cover;background-position:center;filter:blur(48px) saturate(1.3);opacity:.7}
.mv-veil{position:absolute;inset:0;z-index:-1;background:color-mix(in srgb, var(--surface) 72%, transparent)}
.mv-body{display:grid;grid-template-columns:auto minmax(0, 1fr);gap:28px;padding:32px}
.mv-poster{width:180px;aspect-ratio:2/3;border-radius:10px;display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,.7);
  box-shadow:0 18px 40px -14px rgba(0,0,0,.5),0 0 0 1px rgba(0,0,0,.06)}
.mv-kind{display:flex;align-items:center;gap:7px;font-size:12px;font-weight:650;letter-spacing:.1em;text-transform:uppercase;color:var(--text-2)}
.mv-title{font-size:30px;font-weight:750;letter-spacing:-0.025em;line-height:1.1;color:var(--text);margin-top:8px;text-wrap:balance}
.mv-title .mv-year{font-weight:500;color:var(--text-2)}
.mv-by{font-size:15px;color:var(--text-2);margin-top:4px}
.mv-meta{display:flex;flex-wrap:wrap;align-items:center;gap:6px 12px;margin-top:12px;font-size:13.5px;color:var(--text-2)}
.mv-cert{border:1px solid var(--axis);border-radius:4px;padding:0 6px;font-size:12px;font-weight:650;color:var(--text)}
.mv-ratings{display:flex;flex-wrap:wrap;gap:16px;margin-top:14px}
.mv-score{display:flex;align-items:baseline;gap:6px}
.mv-score b{font-size:24px;font-weight:750;color:var(--text);letter-spacing:-0.02em}
.mv-score span{font-size:12.5px;color:var(--text-2)}
.mv-score .icon{align-self:center}
.mv-sum{font-size:14.5px;line-height:1.55;color:var(--text);margin-top:14px}
.mv-row{font-size:13.5px;color:var(--text-2);margin-top:10px}
.mv-row b{color:var(--text);font-weight:600}
.mv-tags{display:flex;flex-wrap:wrap;gap:6px;margin-top:12px}
.mv-prog{margin-top:14px}
.mv-track{height:6px;border-radius:999px;background:color-mix(in srgb, var(--text) 14%, transparent);overflow:hidden}
.mv-track span{display:block;height:100%;border-radius:999px;background:var(--accent)}
.mv-pl{display:flex;justify-content:space-between;font-size:12px;color:var(--text-2);margin-top:6px}
`,
  render(d, ctx) {
    const k = KIND[d.kind];
    const art = imageBackground(d.poster_url, `${d.title}${d.year ?? ''}`);
    const bg = d.backdrop_url ? imageBackground(d.backdrop_url, d.title) : art;
    const narrow = ctx.width < 520;
    const meta = [d.length, ...(d.genres ?? [])].filter(Boolean) as string[];
    const score = d.rating != null ? (Number.isInteger(d.rating) ? String(d.rating) : d.rating.toFixed(1)) : null;
    return html`<div class="mv">
      <div class="mv-bg" style="${style({ 'background-image': bg })}"></div><div class="mv-veil"></div>
      <div class="mv-body" style="${narrow ? 'grid-template-columns:1fr' : ''}">
        <div class="mv-poster bg-img" style="${style({ 'background-image': art, width: narrow ? 140 : 180 })}">${d.poster_url ? '' : icon(k.icon, { size: 40, strokeWidth: 1.4 })}</div>
        <div>
          <div class="mv-kind">${icon(k.icon, { size: 14 })}${k.label}${d.status ? html` · ${d.status}` : null}</div>
          <div class="mv-title">${d.title}${d.year != null ? html` <span class="mv-year">(${String(d.year)})</span>` : null}</div>
          ${d.creator ? html`<div class="mv-by">${d.kind === 'book' ? 'by ' : ''}${d.creator}</div>` : null}
          ${d.certification || meta.length ? html`<div class="mv-meta">${d.certification ? html`<span class="mv-cert">${d.certification}</span>` : null}${meta.join(' · ')}</div>` : null}
          ${score || d.ratings?.length
            ? html`<div class="mv-ratings">
                ${score ? html`<span class="mv-score">${STAR}<b>${score}</b><span>/ ${String(d.rating_max)}${d.rating_source ? ` ${d.rating_source}` : ''}</span></span>` : null}
                ${(d.ratings ?? []).map((r) => html`<span class="mv-score"><b>${r.value}</b><span>${r.source}</span></span>`)}
              </div>`
            : null}
          ${d.summary ? html`<div class="mv-sum">${d.summary}</div>` : null}
          ${d.cast?.length ? html`<div class="mv-row"><b>${d.kind === 'podcast' ? 'Guests' : d.kind === 'book' ? 'Characters' : 'Cast'}:</b> ${d.cast.join(', ')}</div>` : null}
          ${d.where?.length ? html`<div class="mv-row"><b>${WHERE[d.kind]}:</b> ${d.where.join(' · ')}</div>` : null}
          ${d.progress != null
            ? html`<div class="mv-prog"><div class="mv-track"><span style="${`width:${Math.round(d.progress * 100)}%`}"></span></div><div class="mv-pl"><span>${d.progress_label ?? ''}</span><span>${`${Math.round(d.progress * 100)}%`}</span></div></div>`
            : null}
        </div>
      </div>
    </div>`;
  },
});
