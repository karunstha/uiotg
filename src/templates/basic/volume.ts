import { z } from 'zod';
import { iconSchema } from '../../core/format.ts';
import { html, style } from '../../core/html.ts';
import { icon } from '../../core/icons.ts';
import { defineTemplate } from '../../core/types.ts';

const KINDS = {
  volume: { low: 'volume', mid: 'volume-1', high: 'volume-2', off: 'volume-x', label: 'Volume' },
  brightness: { low: 'sun-dim', mid: 'sun-medium', high: 'sun', off: 'sun-dim', label: 'Brightness' },
  temperature: { low: 'thermometer-snowflake', mid: 'thermometer', high: 'thermometer-sun', off: 'thermometer', label: 'Temperature' },
  level: { low: 'gauge', mid: 'gauge', high: 'gauge', off: 'gauge', label: 'Level' },
} as const;

export const volume = defineTemplate({
  id: 'volume',
  title: 'Volume / level slider',
  category: 'basic',
  description:
    'A level meter showing a setting: volume (with mute), brightness, temperature or any 0–max value, with the device or source it applies to. Use to show or confirm a setting the agent just changed.',
  schema: z.object({
    value: z.number().min(0),
    max: z.number().positive().default(100),
    kind: z.enum(['volume', 'brightness', 'temperature', 'level']).default('volume'),
    label: z.string().max(80).optional().describe('What the level is for, e.g. "Living room speaker"'),
    caption: z.string().max(120).optional().describe('e.g. "Spotify · Sonos One"'),
    muted: z.boolean().default(false),
    unit: z.string().max(6).optional().describe('Display unit; default % of max'),
    icon: iconSchema.optional(),
  }),
  example: { label: 'Living room', caption: 'Spotify · Sonos Era 300', value: 62, kind: 'volume' },
  width: 440,
  css: /* css */ `
.vo-top{display:flex;align-items:center;gap:12px}
.vo-ico{width:40px;height:40px;border-radius:12px;flex:none;display:flex;align-items:center;justify-content:center;background:var(--subtle);color:var(--text)}
.vo-main{flex:1;min-width:0}
.vo-label{font-size:16px;font-weight:620;color:var(--text)}
.vo-cap{font-size:13px;color:var(--text-2);margin-top:1px}
.vo-val{font-size:22px;font-weight:650;letter-spacing:-0.02em;color:var(--text);font-variant-numeric:tabular-nums}
.vo-val.vo-off{color:var(--muted);font-size:15px}
.vo-row{display:flex;align-items:center;gap:12px;margin-top:18px;color:var(--muted)}
.vo-track{position:relative;flex:1;height:8px;border-radius:999px}
.vo-fill{position:absolute;left:0;top:0;bottom:0;border-radius:999px}
`,
  render(d, ctx) {
    const k = KINDS[d.kind];
    const frac = Math.max(0, Math.min(1, d.value / d.max));
    const off = d.muted || d.value === 0;
    const glyph = d.icon ?? (off ? k.off : frac < 0.34 ? k.low : frac < 0.67 ? k.mid : k.high);
    const color = off ? ctx.theme.axis : d.kind === 'brightness' ? '#eda100' : d.kind === 'temperature' ? ctx.theme.series[1]! : ctx.theme.accent;
    const pct = `${(frac * 100).toFixed(1)}%`;
    const shown = d.muted ? 'Muted' : d.unit ? `${Math.round(d.value)}${d.unit}` : `${Math.round(frac * 100)}%`;
    return html`<div class="vo-top">
        <span class="vo-ico">${icon(glyph, { size: 20 })}</span>
        <div class="vo-main"><div class="vo-label">${d.label ?? k.label}</div>${d.caption ? html`<div class="vo-cap">${d.caption}</div>` : null}</div>
        <span class="${`vo-val${d.muted ? ' vo-off' : ''}`}">${shown}</span>
      </div>
      <div class="vo-row">
        ${icon(k.low, { size: 16 })}
        <div class="vo-track" style="${style({ background: off ? ctx.theme.subtle : `color-mix(in srgb, ${color} 22%, var(--subtle))` })}">
          <div class="vo-fill" style="${style({ width: pct, background: color })}"></div>
        </div>
        ${icon(k.high, { size: 18 })}
      </div>`;
  },
});
