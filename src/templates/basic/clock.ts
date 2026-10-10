import { z } from 'zod';
import { html, raw, type Html } from '../../core/html.ts';
import { fitFontSize } from '../../core/measure.ts';
import { formatClock, formatDate, parseTime, timeZoneSchema, zoneAbbreviation, zoned } from '../../core/time.ts';
import type { Theme } from '../../core/theme.ts';
import { defineTemplate } from '../../core/types.ts';

/** An analog clock face as SVG; shared with world_clock. */
export function analogFace(hour: number, minute: number, second: number | null, size: number, theme: Theme, night = false): Html {
  const c = size / 2;
  const r = c - 2;
  const face = night ? (theme.mode === 'dark' ? '#0d0d0d' : '#1f2328') : theme.surface;
  const ink = night ? '#f5f5f5' : theme.text;
  const parts: string[] = [`<circle cx="${c}" cy="${c}" r="${r}" fill="${face}" stroke="${theme.border}" stroke-width="1.5"/>`];
  for (let i = 0; i < 60; i++) {
    const major = i % 5 === 0;
    const a = (i / 60) * Math.PI * 2;
    const r1 = r - (major ? size * 0.09 : size * 0.04);
    const r2 = r - size * 0.025;
    parts.push(
      `<line x1="${(c + r1 * Math.sin(a)).toFixed(2)}" y1="${(c - r1 * Math.cos(a)).toFixed(2)}" x2="${(c + r2 * Math.sin(a)).toFixed(2)}" y2="${(c - r2 * Math.cos(a)).toFixed(2)}" stroke="${ink}" stroke-opacity="${major ? 0.85 : 0.3}" stroke-width="${major ? Math.max(1.5, size * 0.012) : 1}" stroke-linecap="round"/>`,
    );
  }
  const hand = (angle: number, length: number, width: number, color: string, tail = 0.1) => {
    const a = (angle * Math.PI) / 180;
    return `<line x1="${(c - length * tail * Math.sin(a)).toFixed(2)}" y1="${(c + length * tail * Math.cos(a)).toFixed(2)}" x2="${(c + length * Math.sin(a)).toFixed(2)}" y2="${(c - length * Math.cos(a)).toFixed(2)}" stroke="${color}" stroke-width="${width}" stroke-linecap="round"/>`;
  };
  const sec = second ?? 0;
  parts.push(hand(((hour % 12) + minute / 60) * 30, r * 0.5, Math.max(3, size * 0.035), ink));
  parts.push(hand((minute + sec / 60) * 6, r * 0.74, Math.max(2.5, size * 0.024), ink));
  if (second != null) parts.push(hand(second * 6, r * 0.82, Math.max(1, size * 0.008), theme.status.critical, 0.18));
  parts.push(`<circle cx="${c}" cy="${c}" r="${Math.max(2.5, size * 0.022)}" fill="${second != null ? theme.status.critical : ink}"/>`);
  return raw(`<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true">${parts.join('')}</svg>`);
}

export const clock = defineTemplate({
  id: 'clock',
  title: 'Clock',
  category: 'basic',
  description:
    'The time as an analog face, a large digital readout, or both, with date and time zone. Give a time zone for "now" there, or a specific time. Use for "what time is it in…", reminders and timestamps.',
  schema: z
    .object({
      label: z.string().max(80).optional().describe('e.g. a city or "Meeting starts"'),
      timezone: timeZoneSchema.optional().describe('IANA zone; the clock shows the current time there unless `time` is given'),
      time: z.string().max(40).optional().describe('"14:32", "14:32:10" or an ISO date-time; default is now'),
      style: z.enum(['analog', 'digital', 'both']).default('both'),
      hour12: z.boolean().default(false),
      show_seconds: z.boolean().default(false),
    })
    .refine((d) => d.time == null || parseTime(d.time) != null, { message: 'time must be "HH:MM[:SS]" or an ISO date-time', path: ['time'] }),
  example: { label: 'Tokyo', timezone: 'Asia/Tokyo', time: '2026-10-09T05:32:00Z', style: 'both' },
  width: (d) => (d.style === 'both' ? 520 : d.style === 'analog' ? 300 : 380),
  css: /* css */ `
.ck{display:flex;align-items:center;gap:28px;justify-content:center}
.ck.col{flex-direction:column;gap:14px;text-align:center}
.ck-label{font-size:13px;font-weight:650;letter-spacing:.06em;text-transform:uppercase;color:var(--text-2)}
.ck-time{font-weight:650;letter-spacing:-0.04em;line-height:1;color:var(--text);font-variant-numeric:tabular-nums;margin-top:6px}
.ck-suffix{font-size:.36em;font-weight:600;letter-spacing:0;color:var(--text-2);margin-left:.15em}
.ck-date{font-size:15px;color:var(--text-2);margin-top:8px}
.ck-zone{font-size:13px;color:var(--muted);margin-top:2px}
`,
  render(d, ctx) {
    const parsed = d.time ? parseTime(d.time)! : { date: new Date() };
    let h: number;
    let m: number;
    let s: number;
    let dateLine: string | null = null;
    let zoneLine: string | null = null;
    if ('date' in parsed) {
      const tz = d.timezone ?? 'UTC';
      const p = zoned(parsed.date, tz);
      [h, m, s] = [p.hour, p.minute, p.second];
      dateLine = formatDate(p);
      zoneLine = d.timezone ? `${zoneAbbreviation(parsed.date, tz)} · ${tz.replace(/_/g, ' ')}` : 'UTC';
    } else {
      [h, m, s] = [parsed.hour, parsed.minute, parsed.second];
      if (d.timezone) zoneLine = d.timezone.replace(/_/g, ' ');
    }
    const night = h < 6 || h >= 19;
    const { time, suffix } = formatClock(h, m, { hour12: d.hour12, second: d.show_seconds ? s : undefined });
    const showAnalog = d.style !== 'digital';
    const showDigital = d.style !== 'analog';
    const faceSize = Math.min(220, d.style === 'both' ? ctx.width * 0.42 : ctx.width);
    const digitalWidth = d.style === 'both' ? ctx.width - faceSize - 28 : ctx.width;
    const timeSize = fitFontSize(`${time}${suffix ? ' PM' : ''}`, digitalWidth, d.style === 'both' ? 56 : 72, 24);
    return html`<div class="${`ck${d.style === 'both' && ctx.width >= 420 ? '' : ' col'}`}">
      ${showAnalog ? analogFace(h, m, d.show_seconds ? s : null, Math.round(faceSize), ctx.theme, night) : null}
      ${showDigital
        ? html`<div>
            ${d.label ? html`<div class="ck-label">${d.label}</div>` : null}
            <div class="ck-time" style="${`font-size:${timeSize}px`}">${time}${suffix ? html`<span class="ck-suffix">${suffix}</span>` : null}</div>
            ${dateLine ? html`<div class="ck-date">${dateLine}</div>` : null}
            ${zoneLine ? html`<div class="ck-zone">${zoneLine}</div>` : null}
          </div>`
        : d.label
          ? html`<div class="ck-label">${d.label}</div>`
          : null}
    </div>`;
  },
});
