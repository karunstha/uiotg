import { z } from 'zod';
import { imageUrlSchema } from '../../core/format.ts';
import { html, style } from '../../core/html.ts';
import { defineTemplate } from '../../core/types.ts';
import { imageBackground, initials } from '../../core/ui.ts';

export const quote = defineTemplate({
  id: 'quote',
  title: 'Quote',
  category: 'text',
  description: 'A pull-quote card with attribution and optional avatar. Use for testimonials, citations and memorable lines.',
  schema: z.object({
    quote: z.string().min(1).max(1200),
    author: z.string().max(120).optional(),
    role: z.string().max(160).optional().describe('Author title, company or source, e.g. "CTO, Acme" or a book title'),
    avatar_url: imageUrlSchema.optional(),
  }),
  example: {
    quote: 'Simple things should be simple, complex things should be possible.',
    author: 'Alan Kay',
    role: 'Computer scientist',
  },
  fit: 'content',
  minWidth: 360,
  width: 760,
  padding: 48,
  css: /* css */ `
.qt{display:flex;flex-direction:column;gap:24px}
.qt-mark{font-size:84px;line-height:0.6;height:38px;font-weight:700;color:var(--accent);font-family:Georgia,serif}
.qt-text{font-weight:550;letter-spacing:-0.018em;color:var(--text);text-wrap:pretty}
.qt-by{display:flex;align-items:center;gap:14px}
.qt-avatar{width:48px;height:48px;border-radius:50%;flex:none;display:flex;align-items:center;justify-content:center;
  color:#fff;font-weight:600;font-size:16px}
.qt-name{font-size:16px;font-weight:600}
.qt-role{font-size:14px;color:var(--text-2)}
`,
  render(d) {
    const len = d.quote.length;
    const size = len < 90 ? 34 : len < 200 ? 27 : len < 420 ? 22 : 18;
    const seed = d.author ?? d.quote;
    return html`<figure class="qt">
      <div class="qt-mark" aria-hidden="true">“</div>
      <blockquote class="qt-text" style="${style({ 'font-size': size, 'line-height': size > 24 ? 1.28 : 1.45 })}">${d.quote}</blockquote>
      ${d.author || d.role
        ? html`<figcaption class="qt-by">
            ${d.author
              ? html`<div class="qt-avatar bg-img" style="${`background-image:${imageBackground(d.avatar_url, seed)}`}">${d.avatar_url ? '' : initials(d.author)}</div>`
              : null}
            <div>
              ${d.author ? html`<div class="qt-name">${d.author}</div>` : null}
              ${d.role ? html`<div class="qt-role">${d.role}</div>` : null}
            </div>
          </figcaption>`
        : null}
    </figure>`;
  },
});
