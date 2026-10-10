import { z } from 'zod';
import { colorSchema, iconSchema, imageUrlSchema } from '../../core/format.ts';
import { html, style } from '../../core/html.ts';
import { icon } from '../../core/icons.ts';
import { inkOn } from '../../core/theme.ts';
import { defineTemplate } from '../../core/types.ts';
import { imageBackground } from '../../core/ui.ts';

export const notification = defineTemplate({
  id: 'notification',
  title: 'Notification',
  category: 'basic',
  photo: 'title',
  description:
    'A phone-style push notification: app icon and name, time, title, message and optional thumbnail, with a stacked look when there are more. Use for alerts, reminders and "you received…" messages.',
  schema: z.object({
    app: z.string().min(1).max(40),
    title: z.string().min(1).max(120),
    message: z.string().max(400).optional(),
    time: z.string().max(20).optional().describe('e.g. "now", "2m ago", "9:41"'),
    icon: iconSchema.optional().describe('App icon (Lucide name or emoji); default "bell"'),
    app_color: colorSchema.optional().describe('App icon background; default accent'),
    image_url: imageUrlSchema.optional().describe('Thumbnail on the right'),
    more: z.number().int().min(0).max(99).default(0).describe('How many more notifications are stacked behind'),
  }),
  example: {
    app: 'Calendar',
    icon: 'calendar',
    app_color: '#e34948',
    time: 'in 10 min',
    title: 'Design review',
    message: 'Room 4B · with Priya, Marco and 3 others. Agenda: onboarding v2 flows.',
    more: 2,
  },
  width: 440,
  padding: 24,
  background: 'plane',
  css: /* css */ `
.nt{position:relative}
.nt-card{position:relative;z-index:2;background:var(--surface);border-radius:20px;padding:14px 16px;
  box-shadow:0 1px 2px rgba(0,0,0,.06),0 10px 30px -10px rgba(0,0,0,.25);border:1px solid var(--border)}
.nt-ghost{position:absolute;left:50%;transform:translateX(-50%);height:24px;border-radius:0 0 18px 18px;background:var(--surface);
  border:1px solid var(--border);border-top:0}
.nt-head{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--text-2)}
.nt-app{font-weight:600;letter-spacing:.04em;text-transform:uppercase;flex:1}
.nt-ico{width:22px;height:22px;border-radius:6px;display:flex;align-items:center;justify-content:center;flex:none}
.nt-body{display:flex;gap:12px;margin-top:8px}
.nt-text{flex:1;min-width:0}
.nt-title{font-size:15px;font-weight:650;color:var(--text);line-height:1.3}
.nt-msg{font-size:14px;line-height:1.4;color:var(--text-2);margin-top:2px}
.nt-thumb{width:48px;height:48px;border-radius:10px;flex:none}
.nt-more{margin-top:10px;font-size:12px;color:var(--muted)}
`,
  render(d, ctx) {
    const bg = d.app_color ?? ctx.theme.accent;
    const ghosts = Math.min(2, d.more);
    return html`<div class="nt" style="${style({ 'padding-bottom': ghosts * 8 })}">
      <div class="nt-card">
        <div class="nt-head">
          <span class="nt-ico" style="${style({ background: bg, color: inkOn(bg) })}">${icon(d.icon ?? 'bell', { size: 14, strokeWidth: 2.25 })}</span>
          <span class="nt-app">${d.app}</span>
          ${d.time ? html`<span>${d.time}</span>` : null}
        </div>
        <div class="nt-body">
          <div class="nt-text">
            <div class="nt-title">${d.title}</div>
            ${d.message ? html`<div class="nt-msg">${d.message}</div>` : null}
            ${d.more ? html`<div class="nt-more">${d.more} more notification${d.more === 1 ? '' : 's'}</div>` : null}
          </div>
          ${d.image_url ? html`<div class="nt-thumb bg-img" style="${style({ 'background-image': imageBackground(d.image_url, d.title) })}"></div>` : null}
        </div>
      </div>
      ${Array.from({ length: ghosts }, (_, i) =>
        html`<div class="nt-ghost" style="${style({ bottom: (ghosts - 1 - i) * 8, width: `${92 - i * 6}%`, 'z-index': 1 - i, opacity: 1 - i * 0.25 })}"></div>`,
      )}
    </div>`;
  },
});
