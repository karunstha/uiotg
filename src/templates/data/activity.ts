import { z } from 'zod';
import { colorSchema, iconSchema, titleFields } from '../../core/format.ts';
import { html, raw, style } from '../../core/html.ts';
import { icon } from '../../core/icons.ts';
import { mix } from '../../core/theme.ts';
import { defineTemplate } from '../../core/types.ts';
import { fitColumns, header } from '../../core/ui.ts';

export const activity = defineTemplate({
  id: 'activity',
  title: 'Activity rings / health summary',
  summary: 'fitness rings and health metrics',
  category: 'data',
  photo: 'keyword',
  description:
    'Daily activity or health at a glance: concentric goal rings (move, exercise, stand, steps…) with value vs goal, plus metric tiles (sleep, heart rate, water, weight). Rings past 100% keep wrapping, like fitness apps.',
  schema: z.object({
    ...titleFields,
    rings: z
      .array(
        z.object({
          label: z.string().min(1).max(30),
          value: z.number().min(0),
          goal: z.number().positive(),
          unit: z.string().max(10).optional(),
          color: colorSchema.optional(),
        }),
      )
      .max(4)
      .default([]),
    metrics: z
      .array(
        z.object({
          label: z.string().min(1).max(30),
          value: z.union([z.number(), z.string().max(20)]),
          unit: z.string().max(10).optional(),
          icon: iconSchema.optional(),
          caption: z.string().max(60).optional().describe('e.g. "Resting" or "↑ 12 min vs avg"'),
        }),
      )
      .max(8)
      .default([]),
  }).refine((d) => d.rings.length || d.metrics.length, { message: 'Give rings or metrics' }),
  example: {
    title: 'Today',
    subtitle: 'Thursday, October 9',
    rings: [
      { label: 'Move', value: 520, goal: 600, unit: 'kcal' },
      { label: 'Exercise', value: 42, goal: 30, unit: 'min' },
      { label: 'Stand', value: 9, goal: 12, unit: 'h' },
    ],
    metrics: [
      { label: 'Steps', value: 11_284, icon: 'footprints' },
      { label: 'Sleep', value: '7h 12m', icon: 'moon', caption: '↑ 24 min vs average' },
      { label: 'Heart rate', value: 58, unit: 'bpm', icon: 'heart-pulse', caption: 'Resting' },
      { label: 'Water', value: 1.6, unit: 'L', icon: 'droplet' },
    ],
  },
  width: 600,
  css: /* css */ `
.at-top{display:flex;align-items:center;gap:28px;flex-wrap:wrap}
.at-legend{flex:1;min-width:200px;display:flex;flex-direction:column;gap:12px}
.at-row{display:grid;grid-template-columns:12px 1fr auto;align-items:baseline;column-gap:10px}
.at-dot{width:12px;height:12px;border-radius:50%;align-self:center}
.at-label{font-size:14px;font-weight:600;color:var(--text)}
.at-val{font-size:15px;font-weight:650;color:var(--text);font-variant-numeric:tabular-nums;text-align:right}
.at-val small{font-size:12.5px;font-weight:500;color:var(--text-2)}
.at-pct{grid-column:2 / 4;font-size:12px;color:var(--text-2)}
.at-tiles{display:grid;gap:10px;margin-top:22px}
.at-tile{background:var(--subtle);border-radius:calc(12px * var(--rk));padding:12px 14px;min-width:0}
.at-tl{display:flex;align-items:center;gap:6px;font-size:12.5px;font-weight:550;color:var(--text-2)}
.at-tv{font-size:22px;font-weight:650;letter-spacing:-0.02em;color:var(--text);margin-top:4px}
.at-tv small{font-size:13px;font-weight:500;color:var(--text-2);margin-left:3px;letter-spacing:0}
.at-tc{font-size:12px;color:var(--muted);margin-top:2px}
`,
  render(d, ctx) {
    const { theme } = ctx;
    const palette = [theme.series[7]!, theme.series[2]!, theme.series[0]!, theme.series[3]!];
    const rings = d.rings.map((r, i) => ({ ...r, color: r.color ?? palette[i]!, frac: r.value / r.goal }));
    const size = 170;
    const stroke = rings.length > 3 ? 13 : 16;
    const gap = 4;
    let svg = '';
    rings.forEach((r, i) => {
      const radius = size / 2 - stroke / 2 - i * (stroke + gap);
      if (radius <= stroke) return;
      const circ = 2 * Math.PI * radius;
      const track = mix(r.color, theme.surface, theme.mode === 'dark' ? 0.72 : 0.8);
      const lap = Math.min(r.frac, 1);
      svg += `<circle cx="${size / 2}" cy="${size / 2}" r="${radius}" fill="none" stroke="${track}" stroke-width="${stroke}"/>`;
      if (lap > 0)
        svg += `<circle cx="${size / 2}" cy="${size / 2}" r="${radius}" fill="none" stroke="${r.color}" stroke-width="${stroke}" stroke-linecap="round" stroke-dasharray="${(circ * lap).toFixed(1)} ${circ.toFixed(1)}" transform="rotate(-90 ${size / 2} ${size / 2})"/>`;
      // Past 100%, a second lap in a darker step shows the overshoot.
      if (r.frac > 1)
        svg += `<circle cx="${size / 2}" cy="${size / 2}" r="${radius}" fill="none" stroke="${mix(r.color, '#000000', 0.25)}" stroke-width="${stroke}" stroke-linecap="round" stroke-dasharray="${(circ * Math.min(r.frac - 1, 1)).toFixed(1)} ${circ.toFixed(1)}" transform="rotate(-90 ${size / 2} ${size / 2})"/>`;
    });
    const cols = fitColumns(Math.min(4, d.metrics.length), ctx.width, 120, 10);
    const num = (v: number) => (Number.isInteger(v) ? v.toLocaleString('en-US') : v.toLocaleString('en-US', { maximumFractionDigits: 1 }));
    return html`${header(d)}
    ${rings.length
      ? html`<div class="at-top">
          ${raw(`<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true">${svg}</svg>`)}
          <div class="at-legend">${rings.map(
            (r) => html`<div class="at-row">
              <span class="at-dot" style="${style({ background: r.color })}"></span>
              <span class="at-label">${r.label}</span>
              <span class="at-val">${num(r.value)} <small>/ ${`${num(r.goal)}${r.unit ? ` ${r.unit}` : ''}`}</small></span>
              <span class="at-pct">${`${Math.round(r.frac * 100)}%`} of goal${r.frac >= 1 ? ' · goal reached' : ''}</span>
            </div>`,
          )}</div>
        </div>`
      : null}
    ${d.metrics.length
      ? html`<div class="at-tiles" style="${`grid-template-columns:repeat(${cols}, minmax(0, 1fr))`}">${d.metrics.map(
          (m) => html`<div class="at-tile">
            <div class="at-tl">${icon(m.icon, { size: 14 })}${m.label}</div>
            <div class="at-tv">${typeof m.value === 'number' ? num(m.value) : m.value}${m.unit ? html`<small>${m.unit}</small>` : null}</div>
            ${m.caption ? html`<div class="at-tc">${m.caption}</div>` : null}
          </div>`,
        )}</div>`
      : null}`;
  },
});
