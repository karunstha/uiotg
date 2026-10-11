import { z } from 'zod';
import { iconSchema, toneSchema } from '../../core/format.ts';
import { html, style } from '../../core/html.ts';
import { icon } from '../../core/icons.ts';
import { measureText } from '../../core/measure.ts';
import { inkOn } from '../../core/theme.ts';
import { defineTemplate } from '../../core/types.ts';
import { toneColor } from '../../core/ui.ts';

const SIZES = {
  sm: { font: 12, padX: 8, height: 22 },
  md: { font: 13, padX: 10, height: 26 },
  lg: { font: 16, padX: 14, height: 34 },
} as const;

export const badge = defineTemplate({
  id: 'badge',
  title: 'Badge',
  category: 'basic',
  description:
    'A single compact badge: a pill ("Beta") or a split label/value badge ("build | passing", "version | 2.4.1"). The image is sized to the badge. Use for statuses, versions and tags.',
  schema: z.object({
    label: z.string().min(1).max(40),
    value: z.string().max(40).optional().describe('When set, renders a split badge: label on the left, value on a colored right half'),
    tone: toneSchema.default('accent'),
    icon: iconSchema.optional(),
    size: z.enum(['sm', 'md', 'lg']).default('md'),
  }),
  example: { label: 'build', value: 'passing', tone: 'success', icon: 'circle-check' },
  width: (d) => {
    const s = SIZES[d.size];
    const iconW = d.icon ? s.font + 6 : 0;
    const label = iconW + measureText(d.label, s.font, true) + s.padX * 2;
    const value = d.value ? measureText(d.value, s.font, true) + s.padX * 2 : 0;
    return Math.ceil(label + value + 24 + 4);
  },
  padding: 12,
  css: /* css */ `
.bd-wrap{display:flex;justify-content:center}
.bd{display:inline-flex;align-items:stretch;border-radius:var(--pill);overflow:hidden;font-weight:600;white-space:nowrap;line-height:1}
.bd > span{display:inline-flex;align-items:center;gap:5px}
.bd-l{color:var(--text)}
`,
  render(d, ctx) {
    const s = SIZES[d.size];
    const color = toneColor(ctx.theme, d.tone);
    const tint = `color-mix(in srgb, ${color} 15%, var(--surface))`;
    const pad = { padding: `0 ${s.padX}px`, height: s.height, 'font-size': s.font };
    const ico = icon(d.icon, { size: s.font + 1, strokeWidth: 2.25 });
    if (d.value) {
      return html`<div class="bd-wrap"><span class="bd">
        <span class="bd-l" style="${style({ ...pad, background: ctx.theme.subtle })}">${ico}${d.label}</span>
        <span style="${style({ ...pad, background: color, color: inkOn(color) })}">${d.value}</span>
      </span></div>`;
    }
    return html`<div class="bd-wrap"><span class="bd">
      <span style="${style({ ...pad, background: tint, color: 'var(--text)' })}"><span style="${`color:${color};display:inline-flex`}">${ico}</span>${d.label}</span>
    </span></div>`;
  },
});
