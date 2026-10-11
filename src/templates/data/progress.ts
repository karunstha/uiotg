import { z } from 'zod';
import { formatSchema, iconSchema, makeFormatter, statusSchema, titleFields } from '../../core/format.ts';
import { html, style } from '../../core/html.ts';
import { icon } from '../../core/icons.ts';
import { mix } from '../../core/theme.ts';
import { defineTemplate } from '../../core/types.ts';
import { header, statusBadge } from '../../core/ui.ts';

export const progress = defineTemplate({
  id: 'progress',
  title: 'Progress / meters',
  category: 'data',
  photo: 'keyword',
  description:
    'Labeled progress bars (meters) with optional targets, captions and status. Use for goals, quotas, budgets, completion, capacity and resource usage.',
  schema: z.object({
    ...titleFields,
    items: z
      .array(
        z.object({
          label: z.string().min(1).max(100),
          value: z.number(),
          max: z.number().positive().default(100),
          target: z.number().optional().describe('Draws a marker at this value'),
          format: formatSchema.optional().describe('When set, shows "value / max" in this format instead of a percentage'),
          status: statusSchema.optional().describe('Colors the fill by severity and adds an icon + label'),
          caption: z.string().max(160).optional(),
          icon: iconSchema.optional(),
        }),
      )
      .min(1)
      .max(24),
  }),
  example: {
    title: 'Q4 objectives',
    subtitle: '6 weeks remaining',
    items: [
      { label: 'New ARR', value: 3.4, max: 5, target: 4, format: { prefix: '$', suffix: 'M', decimals: 1 }, caption: 'Pipeline covers 1.8× the remaining gap' },
      { label: 'Self-serve conversion', value: 61, caption: 'Target 70% by Dec 15', target: 70 },
      { label: 'Infra budget used', value: 92, status: 'warning', caption: 'GPU spend ahead of plan' },
      { label: 'Support backlog cleared', value: 100, status: 'good' },
    ],
  },
  width: 640,
  css: /* css */ `
.pg{display:flex;flex-direction:column;gap:22px}
.pg-top{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin-bottom:8px}
.pg-label{display:flex;align-items:center;gap:7px;font-size:14px;font-weight:550;color:var(--text);min-width:0}
.pg-label .icon{color:var(--text-2)}
.pg-value{font-size:14px;font-weight:600;color:var(--text);font-variant-numeric:tabular-nums;white-space:nowrap}
.pg-value .of{color:var(--muted);font-weight:500}
.pg-track{position:relative;height:10px;border-radius:var(--pill)}
.pg-fill{position:absolute;left:0;top:0;bottom:0;border-radius:var(--pill)}
.pg-target{position:absolute;top:-4px;bottom:-4px;width:2px;border-radius:calc(1px * var(--rk));background:var(--text);margin-left:-1px}
.pg-bottom{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:8px}
.pg-caption{font-size:12px;color:var(--text-2)}
`,
  render(d, ctx) {
    return html`${header(d)}<div class="pg">${d.items.map((it) => {
      const pct = Math.max(0, Math.min(1, it.value / it.max));
      const color = it.status ? ctx.theme.status[it.status] : ctx.theme.accent;
      // Track is a lighter step of the fill's own hue so state reads across the whole bar.
      const track = it.status ? mix(color, ctx.theme.surface, ctx.theme.mode === 'dark' ? 0.75 : 0.8) : ctx.theme.accentTrack;
      const fmt = it.format ? makeFormatter(it.format) : null;
      const value = fmt
        ? html`${fmt(it.value)} <span class="of">/ ${fmt(it.max)}</span>`
        : html`${`${Math.round((it.value / it.max) * 100)}%`}`;
      const targetPct = it.target != null ? Math.max(0, Math.min(1, it.target / it.max)) : null;
      return html`<div class="pg-item">
        <div class="pg-top">
          <div class="pg-label">${icon(it.icon, { size: 15 })}<span class="shrink">${it.label}</span></div>
          <div class="pg-value">${value}</div>
        </div>
        <div class="pg-track" style="${style({ background: track })}">
          <div class="pg-fill" style="${style({ width: `${(pct * 100).toFixed(2)}%`, background: color })}"></div>
          ${targetPct != null ? html`<div class="pg-target" style="${`left:${(targetPct * 100).toFixed(2)}%`}"></div>` : null}
        </div>
        ${it.caption || it.status
          ? html`<div class="pg-bottom"><span class="pg-caption">${it.caption ?? ''}</span>${it.status ? statusBadge(it.status) : null}</div>`
          : null}
      </div>`;
    })}</div>`;
  },
});
