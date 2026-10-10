import { z } from 'zod';
import { iconSchema, titleFields, toneSchema } from '../../core/format.ts';
import { html, style } from '../../core/html.ts';
import { icon } from '../../core/icons.ts';
import { defineTemplate } from '../../core/types.ts';
import { header, toneColor } from '../../core/ui.ts';

const tagSchema = z.union([
  z.string().min(1).max(40),
  z.object({
    label: z.string().min(1).max(40),
    count: z.number().min(0).optional().describe('Shown next to the label; also sizes tags when weighted'),
    tone: toneSchema.optional(),
    icon: iconSchema.optional(),
  }),
]);

export const tags = defineTemplate({
  id: 'tags',
  title: 'Tags / chips',
  category: 'basic',
  description:
    'A wrapping row of tags or chips, optionally with counts, tones and icons, or sized by count as a tag cloud. Use for skills, topics, categories, filters and keywords.',
  schema: z.object({
    ...titleFields,
    tags: z.array(tagSchema).min(1).max(120),
    style: z.enum(['soft', 'outline', 'solid']).default('soft'),
    size: z.enum(['sm', 'md', 'lg']).default('md'),
    weighted: z.boolean().default(false).describe('Scale each tag by its count (tag cloud)'),
  }),
  example: {
    title: 'Trending topics',
    subtitle: 'Mentions this week',
    tags: [
      { label: 'TypeScript', count: 1840 },
      { label: 'Rust', count: 1310 },
      { label: 'MCP', count: 1220, tone: 'accent', icon: 'sparkles' },
      { label: 'Postgres', count: 760 },
      { label: 'WebGPU', count: 540 },
      { label: 'Bun', count: 410 },
      { label: 'Kubernetes', count: 390 },
      { label: 'htmx', count: 220 },
      { label: 'Zig', count: 180 },
    ],
  },
  fit: 'content',
  minWidth: 200,
  width: 600,
  css: /* css */ `
.tg-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.tg{display:inline-flex;align-items:center;gap:6px;border-radius:999px;font-weight:550;white-space:nowrap;line-height:1}
.tg-n{font-weight:500;opacity:.65;font-variant-numeric:tabular-nums}
`,
  render(d, ctx) {
    const items = d.tags.map((t) => (typeof t === 'string' ? { label: t } : t));
    const max = Math.max(1, ...items.map((t) => t.count ?? 0));
    const base = { sm: 12, md: 14, lg: 16 }[d.size];
    return html`${header(d)}<div class="tg-row">${items.map((t) => {
      const font = d.weighted && t.count != null ? Math.round(base * (0.85 + 0.9 * Math.sqrt(t.count / max))) : base;
      const c = t.tone ? toneColor(ctx.theme, t.tone) : null;
      const look =
        d.style === 'solid'
          ? { background: c ?? ctx.theme.text, color: c ? '#fff' : ctx.theme.surface }
          : d.style === 'outline'
            ? { background: 'transparent', color: ctx.theme.text, 'box-shadow': `inset 0 0 0 1px ${c ?? ctx.theme.axis}` }
            : { background: c ? `color-mix(in srgb, ${c} 15%, var(--surface))` : ctx.theme.subtle, color: ctx.theme.text };
      return html`<span class="tg" style="${style({ 'font-size': font, padding: `${Math.round(font * 0.5)}px ${Math.round(font * 0.85)}px`, ...look })}">${
        t.icon ? html`<span style="${style({ color: c && d.style !== 'solid' ? c : undefined, display: 'inline-flex' })}">${icon(t.icon, { size: font })}</span>` : null
      }${t.label}${t.count != null ? html`<span class="tg-n">${t.count.toLocaleString('en-US')}</span>` : null}</span>`;
    })}</div>`;
  },
});
