import { z } from 'zod';
import { imageUrlSchema } from '../../core/format.ts';
import { html, style } from '../../core/html.ts';
import { icon } from '../../core/icons.ts';
import { defineTemplate } from '../../core/types.ts';
import { imageBackground } from '../../core/ui.ts';

function domainOf(url: string): string {
  return url.replace(/^[a-z]+:\/\//i, '').replace(/^www\./, '').split(/[/?#]/)[0] ?? url;
}

export const linkCard = defineTemplate({
  id: 'link_card',
  title: 'Link preview',
  category: 'basic',
  description:
    'A link preview card like the ones chat apps unfurl: optional image, site name/domain, title and description. Use to present a URL, article, product page or resource.',
  schema: z.object({
    url: z.string().min(1).max(500).describe('Shown as its domain; never fetched'),
    title: z.string().min(1).max(200),
    description: z.string().max(400).optional(),
    image_url: imageUrlSchema.optional(),
    site_name: z.string().max(60).optional(),
    favicon_url: imageUrlSchema.optional(),
    layout: z.enum(['vertical', 'horizontal']).optional().describe('Default: vertical with an image, horizontal without'),
  }),
  example: {
    url: 'https://blog.example.com/posts/designing-charts-for-colorblind-readers',
    site_name: 'Example Engineering',
    title: 'Designing charts for colorblind readers',
    description: 'How we validated our categorical palette with CVD simulation, and why the order of colors matters as much as the colors.',
    image_url: 'https://picsum.photos/seed/uiotg-link/1200/630',
  },
  width: 540,
  padding: 20,
  background: 'plane',
  css: /* css */ `
.lk{display:flex;flex-direction:column;border:1px solid var(--border);border-radius:14px;overflow:hidden;background:var(--surface)}
.lk.h{flex-direction:row}
.lk-img{aspect-ratio:1.91/1}
.lk.h .lk-img{aspect-ratio:auto;width:132px;flex:none}
.lk-body{padding:14px 16px 16px;display:flex;flex-direction:column;gap:5px;min-width:0}
.lk-site{display:flex;align-items:center;gap:6px;font-size:12.5px;color:var(--text-2)}
.lk-fav{width:16px;height:16px;border-radius:4px;flex:none}
.lk-site .icon{color:var(--muted)}
.lk-title{font-size:16px;font-weight:650;line-height:1.3;color:var(--text);letter-spacing:-0.01em;
  display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.lk-desc{font-size:14px;line-height:1.45;color:var(--text-2);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
`,
  render(d) {
    const horizontal = (d.layout ?? (d.image_url ? 'vertical' : 'horizontal')) === 'horizontal';
    const domain = domainOf(d.url);
    const site = d.site_name ? `${d.site_name} · ${domain}` : domain;
    return html`<div class="${`lk${horizontal ? ' h' : ''}`}">
      ${d.image_url || !horizontal
        ? html`<div class="lk-img bg-img" style="${style({ 'background-image': imageBackground(d.image_url, d.title) })}"></div>`
        : null}
      <div class="lk-body">
        <div class="lk-site">${d.favicon_url
          ? html`<span class="lk-fav bg-img" style="${style({ 'background-image': imageBackground(d.favicon_url, domain) })}"></span>`
          : icon('globe', { size: 14 })}<span class="ellipsis">${site}</span></div>
        <div class="lk-title">${d.title}</div>
        ${d.description ? html`<div class="lk-desc">${d.description}</div>` : null}
      </div>
    </div>`;
  },
});
