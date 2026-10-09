import { z } from 'zod';
import { iconSchema } from '../../core/format.ts';
import { html, style } from '../../core/html.ts';
import { icon } from '../../core/icons.ts';
import { measureText } from '../../core/measure.ts';
import { inkOn, type Theme } from '../../core/theme.ts';
import { defineTemplate } from '../../core/types.ts';

const SIZES = {
  sm: { font: 13, padX: 12, height: 32, radius: 8, gap: 8 },
  md: { font: 14, padX: 16, height: 40, radius: 10, gap: 10 },
  lg: { font: 16, padX: 22, height: 50, radius: 12, gap: 12 },
} as const;

type Variant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'success';

function variantStyle(v: Variant, theme: Theme): Record<string, string> {
  switch (v) {
    case 'primary':
      return { background: theme.accent, color: inkOn(theme.accent), 'box-shadow': '0 1px 2px rgba(0,0,0,.12)' };
    case 'danger':
      return { background: theme.status.critical, color: '#fff', 'box-shadow': '0 1px 2px rgba(0,0,0,.12)' };
    case 'success':
      return { background: theme.status.good, color: inkOn(theme.status.good), 'box-shadow': '0 1px 2px rgba(0,0,0,.12)' };
    case 'secondary':
      return { background: theme.subtle, color: theme.text };
    case 'outline':
      return { background: 'transparent', color: theme.text, 'box-shadow': `inset 0 0 0 1px ${theme.axis}` };
    case 'ghost':
      return { background: 'transparent', color: theme.accent };
  }
}

const buttonSchema = z.object({
  label: z.string().min(1).max(40),
  variant: z.enum(['primary', 'secondary', 'outline', 'ghost', 'danger', 'success']).default('primary'),
  icon: iconSchema.optional(),
  icon_position: z.enum(['left', 'right']).default('left'),
  disabled: z.boolean().default(false),
});

export const button = defineTemplate({
  id: 'button',
  title: 'Button / call to action',
  category: 'basic',
  description:
    'One to four buttons in a row (primary, secondary, outline, ghost, danger, success), with optional icons. Use to show a call to action or the choices a user has.',
  schema: z.object({
    buttons: z.array(buttonSchema).min(1).max(4),
    size: z.enum(['sm', 'md', 'lg']).default('md'),
    full_width: z.boolean().default(false).describe('Stretch buttons to fill the width (stacked when more than one)'),
  }),
  example: {
    buttons: [
      { label: 'Deploy to production', variant: 'primary', icon: 'rocket' },
      { label: 'View diff', variant: 'outline', icon: 'git-compare' },
    ],
  },
  width: (d) => {
    if (d.full_width) return 400;
    const s = SIZES[d.size];
    const total = d.buttons.reduce((w, b) => w + measureText(b.label, s.font, true) + s.padX * 2 + (b.icon ? s.font + 8 : 0), 0);
    return Math.ceil(total + s.gap * (d.buttons.length - 1) + 40 + 4);
  },
  padding: 20,
  css: /* css */ `
.bt-row{display:flex;justify-content:center;flex-wrap:wrap}
.bt-row.full{flex-direction:column}
.bt{display:inline-flex;align-items:center;justify-content:center;gap:7px;font-weight:600;white-space:nowrap;line-height:1}
.bt.off{opacity:.45}
`,
  render(d, ctx) {
    const s = SIZES[d.size];
    return html`<div class="${`bt-row${d.full_width ? ' full' : ''}`}" style="${`gap:${s.gap}px`}">${d.buttons.map((b) => {
      const ico = icon(b.icon, { size: s.font + 2, strokeWidth: 2.25 });
      return html`<span class="${`bt${b.disabled ? ' off' : ''}`}" style="${style({
        height: s.height,
        padding: `0 ${s.padX}px`,
        'border-radius': `${s.radius}px`,
        'font-size': s.font,
        ...variantStyle(b.variant, ctx.theme),
      })}">${b.icon_position === 'left' ? ico : null}${b.label}${b.icon_position === 'right' ? ico : null}</span>`;
    })}</div>`;
  },
});
