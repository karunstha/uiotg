import { z } from 'zod';
import { imageUrlSchema } from '../../core/format.ts';
import { html, style } from '../../core/html.ts';
import { defineTemplate } from '../../core/types.ts';
import { imageBackground } from '../../core/ui.ts';

const RATIOS = { '16:9': 16 / 9, '3:2': 3 / 2, '4:3': 4 / 3, '1:1': 1, '4:5': 4 / 5, '2:3': 2 / 3 } as const;

export const imageCard = defineTemplate({
  id: 'image_card',
  title: 'Image with caption',
  category: 'basic',
  description:
    'A picture with an optional title, caption and credit, either below the image or overlaid on it. Use to present a photo, screenshot, product shot or illustration.',
  schema: z.object({
    image_url: imageUrlSchema,
    title: z.string().max(120).optional(),
    caption: z.string().max(400).optional(),
    credit: z.string().max(80).optional().describe('e.g. "Photo: Jane Doe"'),
    aspect: z.enum(['16:9', '3:2', '4:3', '1:1', '4:5', '2:3', 'original']).default('16:9').describe('"original" keeps the image’s own proportions'),
    fit: z.enum(['cover', 'contain']).default('cover'),
    text: z.enum(['below', 'overlay']).default('below'),
  }),
  example: {
    image_url: 'https://picsum.photos/seed/uiotg-photo/1280/720',
    title: 'Morning fog over the ridge',
    caption: 'Taken from the north trailhead at 6:40 AM, about an hour after sunrise.',
    credit: 'Photo: Picsum',
  },
  width: 640,
  padding: 20,
  css: /* css */ `
.ic{position:relative}
.ic-media{border-radius:12px;overflow:hidden;background-size:cover;background-position:center}
.ic-media img{width:100%;height:auto;display:block}
.ic-text{margin-top:12px}
.ic-title{font-size:17px;font-weight:650;color:var(--text);letter-spacing:-0.01em}
.ic-cap{font-size:14px;line-height:1.45;color:var(--text-2);margin-top:3px}
.ic-credit{font-size:12px;color:var(--muted);margin-top:6px}
.ic.over .ic-text{position:absolute;left:0;right:0;bottom:0;margin:0;padding:48px 18px 16px;border-radius:0 0 12px 12px;
  background:linear-gradient(180deg, transparent, rgba(0,0,0,.72))}
.ic.over .ic-title{color:#fff}.ic.over .ic-cap{color:rgba(255,255,255,.85)}.ic.over .ic-credit{color:rgba(255,255,255,.65)}
`,
  render(d, ctx) {
    const original = d.aspect === 'original';
    const media = original
      ? html`<div class="ic-media"><img src="${d.image_url}" alt=""></div>`
      : html`<div class="ic-media bg-img" style="${style({
          height: Math.round(ctx.width / RATIOS[d.aspect as keyof typeof RATIOS]),
          'background-image': imageBackground(d.image_url, d.title ?? d.image_url),
          'background-size': d.fit,
          'background-color': 'var(--subtle)',
        })}"></div>`;
    const hasText = d.title || d.caption || d.credit;
    return html`<figure class="${`ic${d.text === 'overlay' ? ' over' : ''}`}">
      ${media}
      ${hasText
        ? html`<figcaption class="ic-text">
            ${d.title ? html`<div class="ic-title">${d.title}</div>` : null}
            ${d.caption ? html`<div class="ic-cap">${d.caption}</div>` : null}
            ${d.credit ? html`<div class="ic-credit">${d.credit}</div>` : null}
          </figcaption>`
        : null}
    </figure>`;
  },
});
