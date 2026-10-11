import { z } from 'zod';
import { imageUrlSchema } from '../../core/format.ts';
import { html, style } from '../../core/html.ts';
import { measureText } from '../../core/measure.ts';
import { defineTemplate } from '../../core/types.ts';
import { imageBackground, initials } from '../../core/ui.ts';

const SIZES = { sm: { avatar: 32, name: 14, sub: 12 }, md: { avatar: 48, name: 16, sub: 13.5 }, lg: { avatar: 72, name: 20, sub: 15 } } as const;

const STATUS = {
  online: { color: 'var(--good)', label: 'Online' },
  away: { color: 'var(--warning)', label: 'Away' },
  busy: { color: 'var(--critical)', label: 'Busy' },
  offline: { color: 'var(--muted)', label: 'Offline' },
} as const;

export const avatar = defineTemplate({
  id: 'avatar',
  title: 'Avatar / user chip',
  summary: 'a person chip with name and status',
  category: 'basic',
  description:
    'A person chip: round photo (or initials on a generated color), name, optional subtitle, presence status and a role tag. Use to show who someone is, an assignee or the author of something.',
  schema: z.object({
    name: z.string().min(1).max(60),
    subtitle: z.string().max(80).optional().describe('Role, handle or email'),
    image_url: imageUrlSchema.optional(),
    status: z.enum(['online', 'away', 'busy', 'offline']).optional(),
    tag: z.string().max(20).optional().describe('Small label next to the name, e.g. "Admin"'),
    size: z.enum(['sm', 'md', 'lg']).default('md'),
  }),
  example: { name: 'Priya Shah', subtitle: 'Engineering manager · @priya', status: 'online', tag: 'Admin' },
  width: (d) => {
    const s = SIZES[d.size];
    const nameW = measureText(d.name, s.name, true) + (d.tag ? measureText(d.tag, 12, true) + 30 : 0);
    const subText = [d.subtitle, d.status ? STATUS[d.status].label : null].filter(Boolean).join(' · ');
    const subW = measureText(subText, s.sub);
    return Math.ceil(Math.min(560, Math.max(nameW, subW) + s.avatar + 14 + 40 + 6));
  },
  padding: 20,
  css: /* css */ `
.av{display:flex;align-items:center;gap:14px}
.av-pic{position:relative;flex:none;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:650}
.av-dot{position:absolute;right:0;bottom:0;border-radius:50%;box-shadow:0 0 0 2.5px var(--surface)}
.av-name{display:flex;align-items:center;gap:8px;font-weight:650;color:var(--text);letter-spacing:-0.01em;white-space:nowrap}
.av-sub{color:var(--text-2);margin-top:2px;white-space:nowrap}
`,
  render(d) {
    const s = SIZES[d.size];
    const st = d.status ? STATUS[d.status] : null;
    const dot = Math.round(s.avatar * 0.26);
    const sub = [d.subtitle, st?.label].filter(Boolean).join(' · ');
    return html`<div class="av">
      <div class="av-pic bg-img" style="${style({ width: s.avatar, height: s.avatar, 'font-size': Math.round(s.avatar * 0.38), 'background-image': imageBackground(d.image_url, d.name) })}">
        ${d.image_url ? '' : initials(d.name)}
        ${st ? html`<span class="av-dot" style="${style({ width: dot, height: dot, background: st.color })}"></span>` : null}
      </div>
      <div>
        <div class="av-name" style="${style({ 'font-size': s.name })}">${d.name}${d.tag ? html`<span class="tag">${d.tag}</span>` : null}</div>
        ${sub ? html`<div class="av-sub" style="${style({ 'font-size': s.sub })}">${sub}</div>` : null}
      </div>
    </div>`;
  },
});
