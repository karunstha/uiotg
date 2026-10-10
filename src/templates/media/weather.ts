import { z } from 'zod';
import { skyArt, type Sky } from '../../core/art.ts';
import { backdrop, backgroundFields } from '../../core/backdrop.ts';
import { html, style } from '../../core/html.ts';
import { icon } from '../../core/icons.ts';
import { fitFontSize } from '../../core/measure.ts';
import { defineTemplate } from '../../core/types.ts';

const condition = z.enum([
  'clear',
  'partly_cloudy',
  'cloudy',
  'overcast',
  'fog',
  'drizzle',
  'rain',
  'showers',
  'thunderstorm',
  'snow',
  'sleet',
  'hail',
  'windy',
]);
type Condition = z.infer<typeof condition>;

const LABEL: Record<Condition, string> = {
  clear: 'Clear',
  partly_cloudy: 'Partly cloudy',
  cloudy: 'Cloudy',
  overcast: 'Overcast',
  fog: 'Fog',
  drizzle: 'Drizzle',
  rain: 'Rain',
  showers: 'Showers',
  thunderstorm: 'Thunderstorms',
  snow: 'Snow',
  sleet: 'Sleet',
  hail: 'Hail',
  windy: 'Windy',
};

const SKY: Record<Condition, Sky> = {
  clear: 'clear',
  partly_cloudy: 'cloudy',
  cloudy: 'cloudy',
  overcast: 'cloudy',
  fog: 'fog',
  drizzle: 'rain',
  rain: 'rain',
  showers: 'rain',
  thunderstorm: 'storm',
  snow: 'snow',
  sleet: 'snow',
  hail: 'snow',
  windy: 'wind',
};

function conditionIcon(c: Condition, night = false): { name: string; color: string } {
  const sun = '#eda100';
  const rain = 'var(--accent)';
  const neutral = 'var(--text-2)';
  switch (c) {
    case 'clear':
      return night ? { name: 'moon', color: '#9085e9' } : { name: 'sun', color: sun };
    case 'partly_cloudy':
      return night ? { name: 'cloud-moon', color: neutral } : { name: 'cloud-sun', color: sun };
    case 'cloudy':
      return { name: 'cloud', color: neutral };
    case 'overcast':
      return { name: 'cloudy', color: neutral };
    case 'fog':
      return { name: 'cloud-fog', color: neutral };
    case 'drizzle':
      return { name: 'cloud-drizzle', color: rain };
    case 'rain':
      return { name: 'cloud-rain', color: rain };
    case 'showers':
      return { name: 'cloud-rain-wind', color: rain };
    case 'thunderstorm':
      return { name: 'cloud-lightning', color: sun };
    case 'snow':
      return { name: 'cloud-snow', color: '#6da7ec' };
    case 'sleet':
      return { name: 'cloud-snow', color: rain };
    case 'hail':
      return { name: 'cloud-hail', color: rain };
    case 'windy':
      return { name: 'wind', color: neutral };
  }
}

export const weather = defineTemplate({
  id: 'weather',
  title: 'Weather',
  category: 'media',
  description:
    'Weather card: current conditions with a large temperature, feels-like/humidity/wind/precipitation, an hourly strip and a daily forecast with temperature range bars.',
  schema: z.object({
    ...backgroundFields,
    location: z.string().min(1).max(80),
    date: z.string().max(60).optional().describe('e.g. "Thursday, 2:30 PM"'),
    units: z.enum(['metric', 'imperial']).default('metric'),
    current: z.object({
      temperature: z.number(),
      condition,
      description: z.string().max(80).optional().describe('Overrides the condition label'),
      feels_like: z.number().optional(),
      high: z.number().optional(),
      low: z.number().optional(),
      humidity: z.number().min(0).max(100).optional().describe('Percent'),
      wind_speed: z.number().min(0).optional().describe('km/h (metric) or mph (imperial)'),
      wind_direction: z.string().max(4).optional().describe('e.g. "NW"'),
      precipitation_chance: z.number().min(0).max(100).optional().describe('Percent'),
      uv_index: z.number().min(0).max(20).optional(),
      is_night: z.boolean().default(false),
    }),
    hourly: z
      .array(z.object({ time: z.string().max(10), temperature: z.number(), condition, precipitation_chance: z.number().min(0).max(100).optional(), is_night: z.boolean().optional() }))
      .max(24)
      .optional(),
    daily: z
      .array(z.object({ day: z.string().max(20), condition, high: z.number(), low: z.number(), precipitation_chance: z.number().min(0).max(100).optional() }))
      .max(14)
      .optional(),
  }),
  example: {
    location: 'Lisbon',
    date: 'Thursday, 2:30 PM',
    current: {
      temperature: 23,
      condition: 'partly_cloudy',
      feels_like: 24,
      high: 25,
      low: 17,
      humidity: 58,
      wind_speed: 14,
      wind_direction: 'NW',
      precipitation_chance: 10,
      uv_index: 6,
    },
    hourly: [
      { time: 'Now', temperature: 23, condition: 'partly_cloudy' },
      { time: '3 PM', temperature: 24, condition: 'clear' },
      { time: '4 PM', temperature: 24, condition: 'clear' },
      { time: '5 PM', temperature: 23, condition: 'partly_cloudy' },
      { time: '6 PM', temperature: 21, condition: 'cloudy' },
      { time: '7 PM', temperature: 20, condition: 'showers', precipitation_chance: 40 },
      { time: '8 PM', temperature: 19, condition: 'clear', is_night: true },
    ],
    daily: [
      { day: 'Today', condition: 'partly_cloudy', high: 25, low: 17 },
      { day: 'Fri', condition: 'rain', high: 20, low: 15, precipitation_chance: 80 },
      { day: 'Sat', condition: 'showers', high: 21, low: 15, precipitation_chance: 50 },
      { day: 'Sun', condition: 'clear', high: 26, low: 16 },
      { day: 'Mon', condition: 'clear', high: 28, low: 18 },
    ],
  },
  width: 560,
  css: /* css */ `
.wx-head.on-bk{border-radius:16px;padding:20px 22px 24px;color:#fff}
.wx-head.on-art .wx-loc,.wx-head.on-art .wx-temp,.wx-head.on-art .wx-cond{color:#fff;text-shadow:0 1px 12px rgba(0,0,0,.25)}
.wx-head.on-art .wx-loc .icon,.wx-head.on-art .wx-date,.wx-head.on-art .wx-hl{color:rgba(255,255,255,.85)}
.wx-top{display:flex;justify-content:space-between;align-items:flex-start;gap:16px}
.wx-loc{display:flex;align-items:center;gap:6px;font-size:20px;font-weight:650;letter-spacing:-0.012em;color:var(--text)}
.wx-loc .icon{color:var(--text-2)}
.wx-date{font-size:13px;color:var(--text-2);margin-top:2px}
.wx-now{display:flex;align-items:center;gap:18px;margin-top:18px}
.wx-temp{font-weight:600;letter-spacing:-0.05em;line-height:1;color:var(--text)}
.wx-cond{font-size:17px;font-weight:550;color:var(--text)}
.wx-hl{font-size:14px;color:var(--text-2);margin-top:3px;font-variant-numeric:tabular-nums}
.wx-facts{display:grid;gap:8px;margin-top:22px}
.wx-fact{background:var(--subtle);border-radius:10px;padding:10px 11px;min-width:0}
.wx-fl{display:flex;align-items:center;gap:4px;font-size:10.5px;font-weight:600;letter-spacing:.03em;text-transform:uppercase;
  color:var(--text-2);white-space:nowrap}
.wx-fv{font-size:16px;font-weight:600;color:var(--text);margin-top:3px;font-variant-numeric:tabular-nums;white-space:nowrap}
.wx-sec{margin-top:22px;padding-top:16px;border-top:1px solid var(--grid)}
.wx-hours{display:flex;justify-content:space-between}
.wx-hour{display:flex;flex-direction:column;align-items:center;gap:7px;min-width:44px}
.wx-ht{font-size:12px;color:var(--text-2)}
.wx-hv{font-size:15px;font-weight:600;color:var(--text);font-variant-numeric:tabular-nums}
.wx-pop{font-size:11px;font-weight:600;color:var(--accent);height:13px}
.wx-days{display:grid;grid-template-columns:minmax(56px, auto) 28px auto auto minmax(60px, 1fr) auto;align-items:center;column-gap:10px;row-gap:14px}
.wx-day{display:contents}
.wx-dn{font-size:15px;font-weight:550;color:var(--text)}
.wx-lo{font-size:15px;color:var(--text-2);text-align:right;font-variant-numeric:tabular-nums}
.wx-hi{font-size:15px;font-weight:600;color:var(--text);text-align:right;font-variant-numeric:tabular-nums}
.wx-range{position:relative;height:6px;border-radius:999px;background:var(--subtle)}
.wx-bar{position:absolute;top:0;bottom:0;border-radius:999px;background:linear-gradient(90deg, #5598e7, #eda100)}
`,
  async render(d, ctx) {
    const c = d.current;
    const deg = (v: number) => `${Math.round(v)}°`;
    const windUnit = d.units === 'imperial' ? 'mph' : 'km/h';
    const ci = conditionIcon(c.condition, c.is_night);
    const facts = [
      c.feels_like != null ? { icon: 'thermometer', label: 'Feels like', value: deg(c.feels_like) } : null,
      c.humidity != null ? { icon: 'droplets', label: 'Humidity', value: `${Math.round(c.humidity)}%` } : null,
      c.wind_speed != null
        ? { icon: 'wind', label: c.wind_direction ? `Wind ${c.wind_direction}` : 'Wind', value: `${Math.round(c.wind_speed)} ${windUnit}` }
        : null,
      c.precipitation_chance != null ? { icon: 'umbrella', label: 'Rain', value: `${Math.round(c.precipitation_chance)}%` } : null,
      c.uv_index != null ? { icon: 'sun', label: 'UV index', value: String(Math.round(c.uv_index)) } : null,
    ].filter((f): f is { icon: string; label: string; value: string } => f != null);

    const days = d.daily ?? [];
    const lo = Math.min(...days.map((x) => x.low));
    const hi = Math.max(...days.map((x) => x.high));
    const span = hi - lo || 1;

    // The current conditions sit on a sky that matches them (or a photo of the place).
    const bg = await backdrop({
      mode: d.background,
      url: d.background_url,
      query: `${d.location} city`,
      art: () => skyArt(SKY[c.condition], c.is_night, Math.round(ctx.width), 240, d.location),
    });
    return html`<div class="wx">
      <div class="${`wx-head${bg ? ' on-bk on-art' : ''}`}">
        ${bg?.layer ?? null}
        <div class="wx-top">
          <div>
            <div class="wx-loc">${icon('map-pin', { size: 18 })}${d.location}</div>
            ${d.date ? html`<div class="wx-date">${d.date}</div>` : null}
          </div>
        </div>
        <div class="wx-now">
          <span style="${`color:${bg ? '#ffffff' : ci.color}`}">${icon(ci.name, { size: 68, strokeWidth: 1.5 })}</span>
          <div class="wx-temp" style="${`font-size:${fitFontSize(deg(c.temperature), ctx.width * 0.4, 76, 28)}px`}">${deg(c.temperature)}</div>
          <div>
            <div class="wx-cond">${c.description ?? LABEL[c.condition]}</div>
            ${c.high != null && c.low != null ? html`<div class="wx-hl">H ${deg(c.high)} · L ${deg(c.low)}</div>` : null}
          </div>
        </div>
      </div>
      ${facts.length
        ? html`<div class="wx-facts" style="${`grid-template-columns:repeat(${facts.length}, minmax(0, 1fr))`}">${facts.map(
            (f) => html`<div class="wx-fact"><div class="wx-fl">${icon(f.icon, { size: 12 })}${f.label}</div><div class="wx-fv">${f.value}</div></div>`,
          )}</div>`
        : null}
      ${d.hourly?.length
        ? html`<div class="wx-sec wx-hours">${d.hourly.map((h) => {
            const hi = conditionIcon(h.condition, h.is_night);
            return html`<div class="wx-hour">
              <span class="wx-ht">${h.time}</span>
              <span style="${`color:${hi.color}`}">${icon(hi.name, { size: 24, strokeWidth: 1.75 })}</span>
              <span class="wx-pop">${h.precipitation_chance ? `${Math.round(h.precipitation_chance)}%` : ''}</span>
              <span class="wx-hv">${deg(h.temperature)}</span>
            </div>`;
          })}</div>`
        : null}
      ${days.length
        ? html`<div class="wx-sec wx-days">${days.map((x) => {
            const di = conditionIcon(x.condition);
            return html`<div class="wx-day">
              <span class="wx-dn">${x.day}</span>
              <span style="${`color:${di.color}`}">${icon(di.name, { size: 22, strokeWidth: 1.75 })}</span>
              <span class="wx-pop" style="height:auto">${x.precipitation_chance ? `${Math.round(x.precipitation_chance)}%` : ''}</span>
              <span class="wx-lo">${deg(x.low)}</span>
              <span class="wx-range"><span class="wx-bar" style="${style({ left: `${(((x.low - lo) / span) * 100).toFixed(1)}%`, width: `${(((x.high - x.low) / span) * 100).toFixed(1)}%` })}"></span></span>
              <span class="wx-hi">${deg(x.high)}</span>
            </div>`;
          })}</div>`
        : null}
    </div>`;
  },
});
