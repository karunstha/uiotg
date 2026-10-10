import { z } from 'zod';
import { iconSchema } from '../../core/format.ts';
import { html } from '../../core/html.ts';
import { icon } from '../../core/icons.ts';
import { renderMarkdown } from '../../core/markdown.ts';
import { defineTemplate } from '../../core/types.ts';

const TONE_COLOR = {
  neutral: 'var(--text-2)',
  accent: 'var(--accent)',
  info: 'var(--accent)',
  success: 'var(--good)',
  warning: 'var(--warning)',
  critical: 'var(--critical)',
} as const;

export const textCard = defineTemplate({
  id: 'text_card',
  title: 'Text card',
  category: 'text',
  photo: 'keyword',
  description:
    'A typographic card: optional eyebrow, headline, Markdown body and footer. Use for announcements, summaries, callouts, definitions or any short answer that should look designed.',
  schema: z
    .object({
      eyebrow: z.string().max(80).optional().describe('Small label above the title, e.g. "Release notes"'),
      title: z.string().max(300).optional(),
      text: z.string().max(10_000).optional().describe('Body text; Markdown supported (bold, lists, links, code)'),
      footer: z.string().max(300).optional().describe('Muted line at the bottom, e.g. a source or date'),
      icon: iconSchema.optional(),
      align: z.enum(['left', 'center']).default('left'),
      size: z.enum(['sm', 'md', 'lg']).default('md').describe('Overall type scale'),
      tone: z
        .enum(['neutral', 'accent', 'info', 'success', 'warning', 'critical'])
        .default('neutral')
        .describe('Adds a colored edge and icon tint to signal intent'),
    })
    .refine((d) => d.title || d.text, { message: 'Provide at least a title or text' }),
  example: {
    eyebrow: 'Release 2.4',
    icon: 'rocket',
    tone: 'accent',
    title: 'Faster builds, smaller bundles',
    text: 'This release cuts **cold build time by 38%** and trims the runtime by 12 KB.\n\n- Incremental type-checking\n- Parallel asset hashing\n- New `--profile` flag',
    footer: 'Shipped October 9, 2026',
  },
  fit: 'content',
  minWidth: 320,
  width: 720,
  css: /* css */ `
.tc{display:flex;flex-direction:column;gap:12px}
.tc.center{align-items:center;text-align:center}
.tc.toned{border-left:4px solid var(--tone);padding-left:24px}
.tc.center.toned{border-left:0;padding-left:0;border-top:4px solid var(--tone);padding-top:24px}
.tc-icon{width:44px;height:44px;border-radius:12px;display:flex;align-items:center;justify-content:center;
  color:var(--tone);background:color-mix(in srgb, var(--tone) 12%, transparent);margin-bottom:4px}
.tc-eyebrow{font-size:12px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:var(--text-2)}
.tc-title{font-weight:650;letter-spacing:-0.022em;line-height:1.15;color:var(--text);text-wrap:balance}
.tc-text{color:var(--text-2)}
.tc-text strong{color:var(--text)}
.tc-footer{margin-top:6px;font-size:13px;color:var(--muted)}
.tc.sm .tc-title{font-size:22px}.tc.sm .tc-text{font-size:14px}
.tc.md .tc-title{font-size:30px}.tc.md .tc-text{font-size:16px}
.tc.lg .tc-title{font-size:46px}.tc.lg .tc-text{font-size:19px}
`,
  async render(d, ctx) {
    const body = d.text ? await renderMarkdown(d.text, ctx.theme.mode) : null;
    const toned = d.tone !== 'neutral';
    return html`<div class="${`tc ${d.size} ${d.align}${toned ? ' toned' : ''}`}" style="${`--tone:${TONE_COLOR[d.tone]}`}">
      ${d.icon ? html`<div class="tc-icon">${icon(d.icon, { size: 22 })}</div>` : null}
      ${d.eyebrow ? html`<div class="tc-eyebrow">${d.eyebrow}</div>` : null}
      ${d.title ? html`<div class="tc-title">${d.title}</div>` : null}
      ${body ? html`<div class="prose tc-text">${body}</div>` : null}
      ${d.footer ? html`<div class="tc-footer">${d.footer}</div>` : null}
    </div>`;
  },
});
