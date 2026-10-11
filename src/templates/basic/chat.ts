import { z } from 'zod';
import { imageUrlSchema } from '../../core/format.ts';
import { html, style } from '../../core/html.ts';
import { inkOn } from '../../core/theme.ts';
import { defineTemplate } from '../../core/types.ts';
import { imageBackground, initials } from '../../core/ui.ts';

export const chat = defineTemplate({
  id: 'chat',
  title: 'Chat conversation',
  summary: 'chat conversation bubbles',
  category: 'basic',
  description:
    'A messaging-app conversation: your messages as accent bubbles on the right, others on the left, consecutive messages grouped, optional sender names (group chats), times and a contact header.',
  schema: z.object({
    title: z.string().max(60).optional().describe('Contact or group name for the header'),
    subtitle: z.string().max(60).optional().describe('e.g. "Active now" or "5 members"'),
    avatar_url: imageUrlSchema.optional(),
    messages: z
      .array(
        z.object({
          role: z.enum(['me', 'them']),
          text: z.string().min(1).max(2000),
          name: z.string().max(40).optional().describe('Sender name, shown for "them" in group chats'),
          time: z.string().max(20).optional(),
        }),
      )
      .min(1)
      .max(60),
  }),
  example: {
    title: 'Marco',
    subtitle: 'Active now',
    messages: [
      { role: 'them', text: 'Did the deploy go out?' },
      { role: 'me', text: 'Yep, 10 minutes ago 🚀' },
      { role: 'me', text: 'Latency is back under 250 ms', time: '14:52' },
      { role: 'them', text: 'Amazing. Want to write the incident summary together tomorrow?' },
      { role: 'me', text: 'Sure, 10am works', time: '14:54' },
    ],
  },
  width: 440,
  padding: 0,
  css: /* css */ `
.ch-head{display:flex;align-items:center;gap:10px;padding:14px 18px;border-bottom:1px solid var(--grid)}
.ch-pic{width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;font-size:14px;font-weight:650;flex:none}
.ch-title{font-size:15px;font-weight:650;color:var(--text)}
.ch-sub{font-size:12px;color:var(--text-2)}
.ch-log{display:flex;flex-direction:column;padding:16px 16px 18px}
.ch-group{display:flex;flex-direction:column;gap:3px;max-width:78%}
.ch-group + .ch-group{margin-top:12px}
.ch-group.me{align-self:flex-end;align-items:flex-end}
.ch-group.them{align-self:flex-start;align-items:flex-start}
.ch-name{font-size:12px;color:var(--text-2);margin:0 0 2px 12px}
.ch-b{padding:8px 13px;font-size:15px;line-height:1.38;border-radius:calc(18px * var(--rk));white-space:pre-wrap;word-break:break-word}
.ch-group.them .ch-b{background:var(--subtle);color:var(--text)}
/* Consecutive bubbles tuck their inner corners together. */
.ch-group.me .ch-b:not(.last){border-bottom-right-radius:6px}
.ch-group.me .ch-b:not(.first){border-top-right-radius:6px}
.ch-group.them .ch-b:not(.last){border-bottom-left-radius:6px}
.ch-group.them .ch-b:not(.first){border-top-left-radius:6px}
.ch-time{font-size:11px;color:var(--muted);margin:2px 6px 0}
`,
  render(d, ctx) {
    const groups: Array<{ role: 'me' | 'them'; name?: string; items: typeof d.messages }> = [];
    for (const m of d.messages) {
      const last = groups[groups.length - 1];
      if (last && last.role === m.role && last.name === m.name) last.items.push(m);
      else groups.push({ role: m.role, name: m.name, items: [m] });
    }
    const meStyle = style({ background: ctx.theme.accent, color: inkOn(ctx.theme.accent) });
    return html`${d.title
      ? html`<div class="ch-head">
          <div class="ch-pic bg-img" style="${style({ 'background-image': imageBackground(d.avatar_url, d.title) })}">${d.avatar_url ? '' : initials(d.title)}</div>
          <div><div class="ch-title">${d.title}</div>${d.subtitle ? html`<div class="ch-sub">${d.subtitle}</div>` : null}</div>
        </div>`
      : null}
    <div class="ch-log">${groups.map((g) => {
      const time = [...g.items].reverse().find((m) => m.time)?.time;
      return html`<div class="${`ch-group ${g.role}`}">
        ${g.role === 'them' && g.name ? html`<div class="ch-name">${g.name}</div>` : null}
        ${g.items.map(
          (m, i) =>
            html`<div class="${`ch-b${i === 0 ? ' first' : ''}${i === g.items.length - 1 ? ' last' : ''}`}" style="${g.role === 'me' ? meStyle : ''}">${m.text}</div>`,
        )}
        ${time ? html`<div class="ch-time">${time}</div>` : null}
      </div>`;
    })}</div>`;
  },
});
