import { z } from 'zod';
import { formatSchema, makeFormatter, statusSchema, titleFields } from '../../core/format.ts';
import { html, raw, style } from '../../core/html.ts';
import { mix, type Status } from '../../core/theme.ts';
import { defineTemplate } from '../../core/types.ts';
import { header, headerHeight, statusBadge } from '../../core/ui.ts';

const START = 150; // degrees, clockwise from +x (SVG coordinates)
const SWEEP = 240;

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

export const gauge = defineTemplate({
  id: 'gauge',
  title: 'Gauge',
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
  render(d, ctx) {
    const { theme } = ctx;
    const fmt = makeFormatter(d.format);
    const span = d.max - d.min || 1;
    const frac = (v: number) => Math.max(0, Math.min(1, (v - d.min) / span));
    const angle = (v: number) => START + SWEEP * frac(v);
    const zones = [...(d.thresholds ?? [])].sort((a, b) => a.from - b.from);
    const current = zones.filter((z) => z.from <= d.value).pop();
    const status: Status | undefined = current?.status;
    const color = status ? theme.status[status] : theme.accent;
    const track = status ? mix(color, theme.surface, theme.mode === 'dark' ? 0.78 : 0.82) : theme.accentTrack;

    let s = Math.min(ctx.width, 320);
    if (ctx.height) s = Math.min(s, (ctx.height - headerHeight(d) - 10) / 0.86);
    const stroke = Math.max(10, Math.round(s * 0.045));
    const cx = s / 2;
    const cy = s / 2;
    const r = s / 2 - stroke / 2 - 10;
    const height = Math.ceil(cy + r * 0.5 + stroke / 2 + 26);

    const parts: string[] = [];
    parts.push(`<path d="${arc(cx, cy, r, START, START + SWEEP)}" fill="none" stroke="${track}" stroke-width="${stroke}" stroke-linecap="round"/>`);
    // Zones: thin arcs outside the track in each threshold's status color.
    zones.forEach((z, i) => {
      const from = angle(Math.max(z.from, d.min));
      const to = angle(i + 1 < zones.length ? zones[i + 1]!.from : d.max);
      if (to - from < 0.5) return;
      parts.push(
        `<path d="${arc(cx, cy, r + stroke / 2 + 6, from + 0.6, to - 0.6)}" fill="none" stroke="${theme.status[z.status]}" stroke-width="3" stroke-linecap="butt" opacity="0.9"/>`,
      );
    });
    if (frac(d.value) > 0.002) {
      parts.push(
        `<path d="${arc(cx, cy, r, START, angle(d.value))}" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round"/>`,
      );
    }
    if (d.target != null) {
      const a = angle(d.target);
      const [x0, y0] = polar(cx, cy, r - stroke / 2 - 4, a);
      const [x1, y1] = polar(cx, cy, r + stroke / 2 + 4, a);
      parts.push(
        `<line x1="${x0.toFixed(2)}" y1="${y0.toFixed(2)}" x2="${x1.toFixed(2)}" y2="${y1.toFixed(2)}" stroke="${theme.text}" stroke-width="2.5" stroke-linecap="round"/>`,
      );
    }
    const [sx, sy] = polar(cx, cy, r, START);
    const [ex, ey] = polar(cx, cy, r, START + SWEEP);
    const valueSize = Math.round(s * 0.16);

    return html`${header(d)}<div class="gg" style="${style({ width: s, height })}">
      ${raw(`<svg width="${s}" height="${height}" viewBox="0 0 ${s} ${height}" aria-hidden="true">${parts.join('')}</svg>`)}
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
