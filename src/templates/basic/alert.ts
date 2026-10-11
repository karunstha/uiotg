import { z } from 'zod';
import { iconSchema, toneSchema } from '../../core/format.ts';
import { html } from '../../core/html.ts';
import { icon } from '../../core/icons.ts';
import { renderInline } from '../../core/markdown.ts';
import { defineTemplate } from '../../core/types.ts';
import { toneColor } from '../../core/ui.ts';

const DEFAULT_ICON = {
  neutral: 'info',
  accent: 'sparkles',
  info: 'info',
  success: 'circle-check',
  warning: 'triangle-alert',
  critical: 'octagon-alert',
} as const;

export const alert = defineTemplate({
  id: 'alert',
  title: 'Alert / banner',
  summary: 'one-message banner, info to critical',
  category: 'basic',
  photo: 'keyword',
  description:
    'A one-message banner with a tone icon: info, success, warning, critical or neutral, plus an optional title and action text. Use for status messages, warnings, confirmations and notices.',
  schema: z.object({
    title: z.string().max(120).optional(),
    message: z.string().min(1).max(600).describe('Inline Markdown supported'),
    tone: toneSchema.default('info'),
    icon: iconSchema.optional().describe('Overrides the tone’s default icon'),
    action: z.string().max(40).optional().describe('Suggested next step, shown as text (not a button), e.g. "Renew the certificate"'),
  }),
  example: {
    tone: 'warning',
    title: 'Certificate expires in 6 days',
    message: '`api.example.com` uses a certificate that expires on **Oct 15**. Renew it to avoid downtime.',
    action: 'Renew now',
  },
  fit: 'content',
  minWidth: 320,
  width: 600,
  padding: 16,
  css: /* css */ `
.alr-box{display:flex;gap:12px;align-items:flex-start;padding:14px 16px;border-radius:calc(12px * var(--rk));
  background:color-mix(in srgb, var(--tone) 9%, var(--surface));border:1px solid color-mix(in srgb, var(--tone) 32%, transparent)}
.alr-ico{color:var(--tone);flex:none;height:21px;display:flex;align-items:center}
.alr-main{flex:1;min-width:0}
.alr-title{font-size:15px;font-weight:620;line-height:21px;color:var(--text)}
.alr-msg{font-size:14px;line-height:20px;color:var(--text-2)}
.alr-title + .alr-msg{margin-top:2px}
.alr-msg code{font-family:var(--font-mono);font-size:.88em;background:color-mix(in srgb, var(--tone) 10%, var(--subtle));padding:.1em .35em;border-radius:calc(4px * var(--rk))}
.alr-msg strong{color:var(--text);font-weight:620}
.alr-act{flex:0 1 auto;max-width:40%;text-align:right;font-size:13px;font-weight:550;color:var(--text-2);line-height:21px}
`,
  render(d, ctx) {
    const color = toneColor(ctx.theme, d.tone);
    return html`<div class="alr-box" style="${`--tone:${color}`}">
      <span class="alr-ico">${icon(d.icon ?? DEFAULT_ICON[d.tone], { size: 19 })}</span>
      <div class="alr-main">
        ${d.title ? html`<div class="alr-title">${d.title}</div>` : null}
        <div class="alr-msg">${renderInline(d.message)}</div>
      </div>
      ${d.action ? html`<span class="alr-act">Next: ${d.action}</span>` : null}
    </div>`;
  },
});
