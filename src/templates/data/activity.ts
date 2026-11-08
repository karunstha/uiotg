import { z } from 'zod';
import { colorSchema, iconSchema, titleFields } from '../../core/format.ts';
import { html, raw, style } from '../../core/html.ts';
import { icon } from '../../core/icons.ts';
import { mix, type Theme } from '../../core/theme.ts';
import { defineTemplate } from '../../core/types.ts';
import { fitFontSize, measureText } from '../../core/measure.ts';
import { CIRCLE_ROW, circleRow, fitColumns, header } from '../../core/ui.ts';

type Ring = { label: string; value: number; goal: number; unit?: string; color: string; frac: number };

/** Concentric goal rings, outermost first, in a `size` square. */
function ringsSvg(rings: Ring[], size: number, stroke: number, gap: number, theme: Theme): string {
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
  return svg;
}

/** The rings with their colors and how far along each is. */
function ringsOf(d: { rings: Array<Omit<Ring, 'color' | 'frac'> & { color?: string }> }, theme: Theme): Ring[] {
  const palette = [theme.series[7]!, theme.series[2]!, theme.series[0]!, theme.series[3]!];
  return d.rings.map((r, i) => ({ ...r, color: r.color ?? palette[i]!, frac: r.value / r.goal }));
}

/** Half the chord of a circle of radius `r` at a row spanning [top, bottom] (relative to the centre). */
function halfChord(r: number, top: number, bottom: number): number {
  const far = Math.max(Math.abs(top), Math.abs(bottom));
  return far >= r ? 0 : Math.sqrt(r * r - far * far);
}

const ROUND_LINE = 24;
const ROUND_TITLE = 28;

const num = (v: number) => (Number.isInteger(v) ? v.toLocaleString('en-US') : v.toLocaleString('en-US', { maximumFractionDigits: 1 }));

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
  circleCss: /* css */ `
.at-rt{font-size:16px;font-weight:600;line-height:20px;margin-bottom:8px;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.at-rings{position:relative;flex:none;margin:0 auto 12px}
.at-rings>svg{display:block}
.at-in{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;line-height:1.1}
.at-iv{font-weight:650;letter-spacing:-0.02em;color:var(--text);font-variant-numeric:tabular-nums}
.at-iu{font-size:13px;color:var(--text-2)}
.at-rl{display:flex;align-items:center;justify-content:center;gap:8px;height:24px;font-size:16px;white-space:nowrap}
.at-rl .at-dot{width:10px;height:10px;flex:none}
.at-rl b{font-weight:600;color:var(--text)}
.at-rl span{color:var(--text-2);font-variant-numeric:tabular-nums}
.at-rm{display:flex;align-items:center;justify-content:center;gap:14px;height:24px;margin-top:4px;font-size:14px;color:var(--text-2);white-space:nowrap}
.at-rm>span{display:inline-flex;align-items:center;gap:5px}
.at-rm b{font-weight:600;color:var(--text)}
`,
  renderCircle(d, ctx) {
    const { theme } = ctx;
    const rings = ringsOf(d, theme);
    const R = ctx.circle.safe / 2;
    const D = ctx.circle.diameter;
    const unitOf = (r: Ring) => (r.unit ? ` ${r.unit}` : '');
    const ringText = (r: Ring) => `${num(r.value)}/${num(r.goal)}${unitOf(r)}`;
    const ringWidth = (r: Ring) => 10 + 8 + measureText(r.label, 16, true) + 8 + measureText(ringText(r), 16);
    const metricText = (m: (typeof d.metrics)[number]) => `${typeof m.value === 'number' ? num(m.value) : m.value}${m.unit ? ` ${m.unit}` : ''}`;
    const metricWidth = (m: (typeof d.metrics)[number]) => (m.icon ? 19 : 0) + measureText(m.label, 14) + 5 + measureText(metricText(m), 14, true);
    const lineWidth = (ms: typeof d.metrics) => ms.reduce((w, m) => w + metricWidth(m), 0) + 14 * Math.max(0, ms.length - 1);
    const sized = (size: number) => {
      const stroke = size * (rings.length > 3 ? 0.075 : 0.094);
      return { size, stroke, gap: size * 0.024 };
    };

    // Stack: optional title, the rings, one legend line per ring, optional metrics line; centred on the circle.
    // A plan fits when the rings stay inside the circle and every line is narrower than its chord.
    type Plan = { title: boolean; metrics: number; size: number };
    const fits = (p: Plan) => {
      const lines: Array<{ h: number; w: number; mt?: number }> = [];
      if (p.title) lines.push({ h: ROUND_TITLE, w: measureText(d.title!, 16, true) });
      const ringAt = lines.reduce((y, l) => y + l.h, 0);
      lines.push({ h: p.size + 12, w: 0 });
      for (const r of rings) lines.push({ h: ROUND_LINE, w: ringWidth(r) });
      if (p.metrics) lines.push({ h: ROUND_LINE + 4, w: lineWidth(d.metrics.slice(0, p.metrics)) });
      const total = lines.reduce((y, l) => y + l.h, 0);
      const ringCentre = -total / 2 + ringAt + p.size / 2;
      if (Math.abs(ringCentre) + p.size / 2 > R - 4) return false;
      let y = -total / 2;
      for (const l of lines) {
        if (l.w && l.w > 2 * (halfChord(R, y, y + l.h) - 10)) return false;
        y += l.h;
      }
      return true;
    };
    const withTitle = !!d.title;
    const options: Array<Omit<Plan, 'size'> & { min: number }> = [
      { title: withTitle, metrics: Math.min(2, d.metrics.length), min: 0.55 },
      { title: withTitle, metrics: Math.min(1, d.metrics.length), min: 0.55 },
      { title: withTitle, metrics: 0, min: 0.5 },
      { title: false, metrics: 0, min: 0.3 },
    ];
    let plan: Plan | null = null;
    if (rings.length) {
      for (const o of options) {
        for (let size = Math.round(D * 0.7); size >= D * o.min && !plan; size -= 2) {
          if (fits({ ...o, size })) plan = { ...o, size };
        }
        if (plan) break;
      }
      plan ??= { title: false, metrics: 0, size: Math.round(D * 0.3) };
    }
    const title = (plan ? plan.title : withTitle) && d.title ? html`<div class="${circleRow('at-rt')}">${d.title}</div>` : null;
    const metric = (m: (typeof d.metrics)[number]) =>
      html`<span>${icon(m.icon, { size: 14 })}${m.label} <b>${metricText(m)}</b></span>`;
    if (!plan) {
      // Metrics only: one line each (the cap and shrink steps handle too many).
      return html`${title}${d.metrics.map((m) => html`<div class="${`at-rm ${CIRCLE_ROW}`}">${metric(m)}</div>`)}`;
    }
    const { size, stroke, gap } = sized(plan.size);
    // The first ring's value in the middle, when the innermost ring leaves room for it.
    const first = rings[0]!;
    const hole = 2 * (size / 2 - stroke - (rings.length - 1) * (stroke + gap)) - 12;
    const valueSize = fitFontSize(num(first.value), hole * 0.8, Math.round(size * 0.15), 12);
    const showValue = valueSize >= 14 && valueSize * 1.1 + (first.unit ? 15 : 0) <= hole * 0.75;
    return html`${title}
    <div class="at-rings" style="${style({ width: size, height: size })}">
      ${raw(`<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true">${ringsSvg(rings, size, stroke, gap, theme)}</svg>`)}
      ${showValue
        ? html`<div class="at-in"><div class="at-iv" style="${style({ 'font-size': valueSize })}">${num(first.value)}</div>${first.unit ? html`<div class="at-iu">${first.unit}</div>` : null}</div>`
        : null}
    </div>
    ${rings.map(
      (r) => html`<div class="${`at-rl ${CIRCLE_ROW}`}"><span class="at-dot" style="${style({ background: r.color })}"></span><b>${r.label}</b><span>${ringText(r)}</span></div>`,
    )}
    ${plan.metrics ? html`<div class="${`at-rm ${CIRCLE_ROW}`}">${d.metrics.slice(0, plan.metrics).map(metric)}</div>` : null}`;
  },
  render(d, ctx) {
    const { theme } = ctx;
    const rings = ringsOf(d, theme);
    const size = 170;
    const stroke = rings.length > 3 ? 13 : 16;
    const gap = 4;
    const svg = ringsSvg(rings, size, stroke, gap, theme);
    const cols = fitColumns(Math.min(4, d.metrics.length), ctx.width, 120, 10);
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
