import { z } from 'zod';
import { formatSchema, makeFormatter, statusSchema, titleFields } from '../../core/format.ts';
import { html, raw, style } from '../../core/html.ts';
import { measureText, fitFontSize } from '../../core/measure.ts';
import { mix, type Status, type Theme } from '../../core/theme.ts';
import { defineTemplate } from '../../core/types.ts';
import { header, headerHeight, statusBadge } from '../../core/ui.ts';

const START = 150; // degrees, clockwise from +x (SVG coordinates)
const SWEEP = 240;
// Round screens: a 270° ring open at the bottom.
const ROUND_START = 135;
const ROUND_SWEEP = 270;

function polar(cx: number, cy: number, r: number, deg: number): [number, number] {
  const rad = (deg * Math.PI) / 180;
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
}

function arc(cx: number, cy: number, r: number, from: number, to: number): string {
  const [x0, y0] = polar(cx, cy, r, from);
  const [x1, y1] = polar(cx, cy, r, to);
  const large = to - from > 180 ? 1 : 0;
  return `M${x0.toFixed(2)} ${y0.toFixed(2)}A${r} ${r} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

type Zone = { from: number; status: Status; label?: string };

/** The value's zone, its color and the track under it. */
function gaugeColors(d: { value: number; thresholds?: Zone[] }, theme: Theme) {
  const zones = [...(d.thresholds ?? [])].sort((a, b) => a.from - b.from);
  const current = zones.filter((z) => z.from <= d.value).pop();
  const status: Status | undefined = current?.status;
  const color = status ? theme.status[status] : theme.accent;
  const track = status ? mix(color, theme.surface, theme.mode === 'dark' ? 0.78 : 0.82) : theme.accentTrack;
  return { zones, current, status, color, track };
}

/** SVG paths: the track, zone arcs outside it, the value arc and the target tick. */
function gaugeArcs(g: {
  cx: number;
  cy: number;
  r: number;
  stroke: number;
  start: number;
  sweep: number;
  angle: (v: number) => number;
  frac: (v: number) => number;
  zones: Zone[];
  value: number;
  min: number;
  max: number;
  target?: number;
  color: string;
  track: string;
  theme: Theme;
  zoneOffset: number;
}): string {
  const { cx, cy, r, stroke, theme, zones, angle } = g;
  const parts: string[] = [];
  parts.push(`<path d="${arc(cx, cy, r, g.start, g.start + g.sweep)}" fill="none" stroke="${g.track}" stroke-width="${stroke}" stroke-linecap="round"/>`);
  // Zones: thin arcs outside the track in each threshold's status color.
  zones.forEach((z, i) => {
    const from = angle(Math.max(z.from, g.min));
    const to = angle(i + 1 < zones.length ? zones[i + 1]!.from : g.max);
    if (to - from < 0.5) return;
    parts.push(
      `<path d="${arc(cx, cy, r + stroke / 2 + g.zoneOffset, from + 0.6, to - 0.6)}" fill="none" stroke="${theme.status[z.status]}" stroke-width="3" stroke-linecap="butt" opacity="0.9"/>`,
    );
  });
  if (g.frac(g.value) > 0.002) {
    parts.push(`<path d="${arc(cx, cy, r, g.start, angle(g.value))}" fill="none" stroke="${g.color}" stroke-width="${stroke}" stroke-linecap="round"/>`);
  }
  if (g.target != null) {
    const a = angle(g.target);
    const [x0, y0] = polar(cx, cy, r - stroke / 2 - 4, a);
    const [x1, y1] = polar(cx, cy, r + stroke / 2 + 4, a);
    parts.push(
      `<line x1="${x0.toFixed(2)}" y1="${y0.toFixed(2)}" x2="${x1.toFixed(2)}" y2="${y1.toFixed(2)}" stroke="${theme.text}" stroke-width="2.5" stroke-linecap="round"/>`,
    );
  }
  return parts.join('');
}

export const gauge = defineTemplate({
  id: 'gauge',
  title: 'Gauge',
  summary: 'one value against a range',
  category: 'chart',
  description:
    'A single value on a min–max arc, with optional status thresholds (zones), a target marker and a status badge. Use for utilization, scores, health and progress toward a limit.',
  schema: z.object({
    ...titleFields,
    value: z.number(),
    min: z.number().default(0),
    max: z.number().default(100),
    label: z.string().max(60).optional().describe('Caption under the value, e.g. "CPU utilization"'),
    format: formatSchema.optional(),
    thresholds: z
      .array(z.object({ from: z.number(), status: statusSchema, label: z.string().max(30).optional() }))
      .max(6)
      .optional()
      .describe('Zones: each applies from its value up to the next threshold. The value’s zone sets the color and status badge.'),
    target: z.number().optional().describe('Draws a tick at this value'),
  }),
  example: {
    title: 'Cluster memory',
    subtitle: 'prod-us-east · 64 nodes',
    value: 78,
    label: 'Memory utilization',
    format: { suffix: '%' },
    thresholds: [
      { from: 0, status: 'good', label: 'Healthy' },
      { from: 70, status: 'warning', label: 'High' },
      { from: 90, status: 'critical', label: 'Critical' },
    ],
    target: 85,
  },
  width: 420,
  css: /* css */ `
.gg{position:relative;margin:0 auto}
.gg-center{position:absolute;left:0;right:0;display:flex;flex-direction:column;align-items:center;text-align:center}
.gg-value{font-weight:650;letter-spacing:-0.03em;color:var(--text);line-height:1.05}
.gg-label{font-size:13px;color:var(--text-2);margin-top:4px}
.gg-badge{margin-top:8px}
.gg-end{position:absolute;width:64px;margin-left:-32px;text-align:center;font-size:12px;color:var(--muted);font-variant-numeric:tabular-nums}
`,
  circleCss: /* css */ `
.gg-round{position:relative;flex:none;margin:0 auto}
.gg-round>svg{position:absolute;left:0;top:0}
.gg-rc{position:absolute;left:0;right:0;display:flex;flex-direction:column;align-items:center;text-align:center}
.gg-rt{font-size:15px;font-weight:600;color:var(--text);line-height:20px;white-space:nowrap}
.gg-rs{font-size:12.5px;color:var(--text-2);line-height:17px;white-space:nowrap}
.gg-rc .gg-value{margin-top:6px}
.gg-rc .gg-label{font-size:15px;line-height:20px}
.gg-rc .gg-badge .status{font-size:14px}
.gg-rend{position:absolute;transform:translateX(-50%);font-size:13px;line-height:16px;color:var(--muted);white-space:nowrap;font-variant-numeric:tabular-nums}
`,
  renderCircle(d, ctx) {
    const { theme } = ctx;
    const fmt = makeFormatter(d.format);
    const { zones, current, status, color, track } = gaugeColors(d, theme);
    const s = ctx.circle.safe;
    const cx = s / 2;
    const cy = s / 2;
    // Outermost ink (the zone arc) a few px inside the safe circle.
    const stroke = Math.max(14, Math.round(s * 0.07));
    const r = s / 2 - 4 - 3 - 6 - stroke / 2;
    const span = d.max - d.min || 1;
    const frac = (v: number) => Math.max(0, Math.min(1, (v - d.min) / span));
    const angle = (v: number) => ROUND_START + ROUND_SWEEP * frac(v);
    const svg = gaugeArcs({ cx, cy, r, stroke, start: ROUND_START, sweep: ROUND_SWEEP, angle, frac, zones, value: d.value, min: d.min, max: d.max, target: d.target, color, track, theme, zoneOffset: 6 });

    // Inside the ring: title and subtitle (when they fit), the value, label and badge, stacked around the centre.
    const inner = r - stroke / 2 - 10;
    const valueText = fmt(d.value);
    const valueSize = fitFontSize(valueText, inner * 1.5, Math.round(s * 0.2), 28);
    const below = (d.label ? 21 : 0) + (status ? 30 : 0);
    const core = 6 + valueSize * 1.05 + below;
    // Half the width of the inner circle at a height `top` above (or below) the centre.
    const half = (dy: number) => Math.sqrt(Math.max(0, inner * inner - dy * dy));
    const fits = (text: string, size: number, bold: boolean, dy: number) => measureText(text, size, bold) <= 2 * half(Math.abs(dy)) - 8;
    let title = d.title;
    let subtitle = d.subtitle;
    const heads = () => (title ? 20 : 0) + (subtitle ? 17 : 0);
    const top = () => cy - (heads() + core) / 2;
    // Drop the subtitle, then the title, until both fit at their height.
    for (let i = 0; i < 3; i++) {
      const t0 = top();
      if (subtitle && !fits(subtitle, 12.5, false, cy - (t0 + (title ? 20 : 0)))) subtitle = undefined;
      else if (title && !fits(title, 15, true, cy - t0)) title = undefined;
      else break;
    }
    const [sx, sy] = polar(cx, cy, r, ROUND_START);
    const [ex, ey] = polar(cx, cy, r, ROUND_START + ROUND_SWEEP);
    // Min and max just inside the ring's ends, in the opening at the bottom.
    const endY = sy + stroke / 2 - 2;
    const endIn = stroke * 0.5 + 6;
    return html`<div class="gg-round" style="${style({ width: s, height: s })}">
      ${raw(`<svg width="${s}" height="${s}" viewBox="0 0 ${s} ${s}" aria-hidden="true">${svg}</svg>`)}
      <div class="gg-rc" style="${style({ top: top() })}">
        ${title ? html`<div class="gg-rt">${title}</div>` : null}
        ${subtitle ? html`<div class="gg-rs">${subtitle}</div>` : null}
        <div class="gg-value" style="${style({ 'font-size': valueSize })}">${valueText}</div>
        ${d.label && fits(d.label, 15, false, valueSize / 2 + 12) ? html`<div class="gg-label">${d.label}</div>` : null}
        ${status ? html`<div class="gg-badge">${statusBadge(status, current?.label)}</div>` : null}
      </div>
      <div class="gg-rend" style="${style({ left: sx + endIn, top: endY })}">${fmt(d.min)}</div>
      <div class="gg-rend" style="${style({ left: ex - endIn, top: endY })}">${fmt(d.max)}</div>
      ${d.target != null ? html`<div class="gg-rend" style="${style({ left: cx, top: endY + 20 })}">${`Target ${fmt(d.target)}`}</div>` : null}
    </div>`;
  },
  render(d, ctx) {
    const { theme } = ctx;
    const fmt = makeFormatter(d.format);
    const span = d.max - d.min || 1;
    const frac = (v: number) => Math.max(0, Math.min(1, (v - d.min) / span));
    const angle = (v: number) => START + SWEEP * frac(v);
    const { zones, current, status, color, track } = gaugeColors(d, theme);

    let s = Math.min(ctx.width, 320);
    if (ctx.height) s = Math.min(s, (ctx.height - headerHeight(d) - 10) / 0.86);
    const stroke = Math.max(10, Math.round(s * 0.045));
    const cx = s / 2;
    const cy = s / 2;
    const r = s / 2 - stroke / 2 - 10;
    const height = Math.ceil(cy + r * 0.5 + stroke / 2 + 26);

    const svg = gaugeArcs({ cx, cy, r, stroke, start: START, sweep: SWEEP, angle, frac, zones, value: d.value, min: d.min, max: d.max, target: d.target, color, track, theme, zoneOffset: 6 });
    const [sx, sy] = polar(cx, cy, r, START);
    const [ex, ey] = polar(cx, cy, r, START + SWEEP);
    const valueSize = Math.round(s * 0.16);

    return html`${header(d)}<div class="gg" style="${style({ width: s, height })}">
      ${raw(`<svg width="${s}" height="${height}" viewBox="0 0 ${s} ${height}" aria-hidden="true">${svg}</svg>`)}
      <div class="gg-center" style="${style({ top: cy - valueSize * 0.75 })}">
        <div class="gg-value" style="${style({ 'font-size': valueSize })}">${fmt(d.value)}</div>
        ${d.label ? html`<div class="gg-label">${d.label}</div>` : null}
        ${status ? html`<div class="gg-badge">${statusBadge(status, current?.label)}</div>` : null}
      </div>
      <div class="gg-end" style="${style({ left: sx, top: sy + stroke / 2 + 6 })}">${fmt(d.min)}</div>
      <div class="gg-end" style="${style({ left: ex, top: ey + stroke / 2 + 6 })}">${fmt(d.max)}</div>
    </div>
    ${d.target != null ? html`<div class="gg-label" style="text-align:center;margin-top:6px">Target ${fmt(d.target)}</div>` : null}`;
  },
});
