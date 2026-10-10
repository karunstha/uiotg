import { z } from 'zod';
import { colorSchema, titleFields } from '../../core/format.ts';
import { html, style, type Html } from '../../core/html.ts';
import { icon } from '../../core/icons.ts';
import { defineTemplate } from '../../core/types.ts';
import { fitColumns, header } from '../../core/ui.ts';

const TYPES = ['light', 'switch', 'plug', 'fan', 'thermostat', 'lock', 'door', 'window', 'blinds', 'sensor', 'tv', 'speaker', 'vacuum', 'camera', 'scene'] as const;
type DeviceType = (typeof TYPES)[number];

const ICONS: Record<DeviceType, [on: string, off: string]> = {
  light: ['lightbulb', 'lightbulb-off'],
  switch: ['toggle-right', 'toggle-left'],
  plug: ['plug-zap', 'plug'],
  fan: ['fan', 'fan'],
  thermostat: ['thermometer', 'thermometer'],
  lock: ['lock-open', 'lock'],
  door: ['door-open', 'door-closed'],
  window: ['app-window', 'app-window'],
  blinds: ['blinds', 'blinds'],
  sensor: ['activity', 'activity'],
  tv: ['tv', 'tv-minimal'],
  speaker: ['speaker', 'speaker'],
  vacuum: ['bot', 'bot'],
  camera: ['cctv', 'cctv'],
  scene: ['sparkles', 'sparkles'],
};

/** States that count as "active" when no explicit `on` is given. */
const ACTIVE = /^(on|open|opening|unlocked|playing|heating|cooling|cleaning|recording|home|active|running|detected)$/i;

const deviceSchema = z.object({
  name: z.string().min(1).max(60),
  type: z.enum(TYPES),
  state: z.string().max(40).optional().describe('e.g. "on", "off", "locked", "open", "heating", "playing"'),
  on: z.boolean().optional().describe('Overrides the active/inactive look derived from state'),
  brightness: z.number().min(0).max(100).optional().describe('Lights: percent'),
  color: colorSchema.optional().describe('Lights: current color'),
  value: z.union([z.number(), z.string().max(30)]).optional().describe('Sensor reading or current temperature'),
  unit: z.string().max(8).optional(),
  target: z.number().optional().describe('Thermostat setpoint'),
  battery: z.number().min(0).max(100).optional(),
  area: z.string().max(40).optional().describe('Room; devices are grouped by area'),
});

type Device = z.infer<typeof deviceSchema>;

function stateText(d: Device, active: boolean): string {
  const parts: string[] = [];
  if (d.type === 'thermostat') {
    if (d.value != null) parts.push(`${d.value}${d.unit ?? '°'}`);
    if (d.target != null) parts.push(`→ ${d.target}${d.unit ?? '°'}`);
    if (d.state) parts.push(d.state[0]!.toUpperCase() + d.state.slice(1));
    return parts.join(' ');
  }
  if (d.type === 'sensor') return d.value != null ? `${d.value}${d.unit ? ` ${d.unit}` : ''}` : (d.state ?? '—');
  const state = d.state ? d.state[0]!.toUpperCase() + d.state.slice(1) : active ? 'On' : 'Off';
  parts.push(state);
  if (d.type === 'light' && active && d.brightness != null) parts.push(`${Math.round(d.brightness)}%`);
  return parts.join(' · ');
}

export const smartHome = defineTemplate({
  id: 'smart_home',
  title: 'Smart home',
  category: 'media',
  description:
    'Home Assistant–style device tiles grouped by room: lights (with brightness and color), switches, plugs, fans, thermostats, locks, doors, blinds, sensors, media and more, each showing its state. Use to report or confirm the state of a home.',
  schema: z.object({
    ...titleFields,
    devices: z.array(deviceSchema).min(1).max(48),
  }),
  example: {
    title: 'Home',
    subtitle: 'Evening scene active · 3 lights on',
    devices: [
      { name: 'Ceiling', type: 'light', state: 'on', brightness: 70, color: '#ffb661', area: 'Living room' },
      { name: 'Floor lamp', type: 'light', state: 'on', brightness: 35, color: '#ff8ad1', area: 'Living room' },
      { name: 'TV', type: 'tv', state: 'playing', area: 'Living room' },
      { name: 'Thermostat', type: 'thermostat', value: 21.5, target: 22, state: 'heating', area: 'Living room' },
      { name: 'Pendant', type: 'light', state: 'on', brightness: 90, area: 'Kitchen' },
      { name: 'Coffee machine', type: 'plug', state: 'off', area: 'Kitchen' },
      { name: 'Air quality', type: 'sensor', value: 412, unit: 'ppm', area: 'Kitchen' },
      { name: 'Front door', type: 'lock', state: 'locked', battery: 14, area: 'Entrance' },
      { name: 'Garage', type: 'door', state: 'closed', area: 'Entrance' },
    ],
  },
  width: 760,
  background: 'plane',
  css: /* css */ `
.sh-area + .sh-area{margin-top:20px}
.sh-area-h{font-size:13px;font-weight:650;letter-spacing:.05em;text-transform:uppercase;color:var(--text-2);margin-bottom:10px}
.sh-grid{display:grid;gap:10px}
.sh-tile{position:relative;border-radius:16px;padding:14px;background:var(--surface);border:1px solid var(--border);min-width:0;
  display:flex;flex-direction:column;gap:12px}
.sh-tile.sh-on{border-color:color-mix(in srgb, var(--glow) 45%, var(--border));
  background:linear-gradient(160deg, color-mix(in srgb, var(--glow) 18%, var(--surface)), var(--surface) 70%)}
.sh-head{display:flex;align-items:flex-start;justify-content:space-between;gap:8px}
.sh-ico{width:38px;height:38px;border-radius:50%;flex:none;display:flex;align-items:center;justify-content:center;background:var(--subtle);color:var(--muted)}
.sh-tile.sh-on .sh-ico{background:var(--glow);color:#fff}
.sh-bat{display:inline-flex;align-items:center;gap:3px;font-size:11.5px;font-weight:600;color:var(--critical)}
.sh-name{font-size:14px;font-weight:620;color:var(--text);line-height:1.3}
.sh-state{font-size:13px;color:var(--text-2);margin-top:2px}
.sh-tile.sh-on .sh-state{color:var(--text)}
.sh-bar{height:4px;border-radius:999px;background:var(--subtle);overflow:hidden}
.sh-bar span{display:block;height:100%;border-radius:999px;background:var(--glow)}
`,
  render(d, ctx) {
    const areas: string[] = [];
    for (const dev of d.devices) if (!areas.includes(dev.area ?? '')) areas.push(dev.area ?? '');
    const cols = fitColumns(4, ctx.width, 150, 10);
    const tile = (dev: Device): Html => {
      const active = dev.on ?? (dev.type === 'thermostat' ? /heat|cool/i.test(dev.state ?? '') : dev.type === 'sensor' ? false : ACTIVE.test(dev.state ?? ''));
      const glow =
        dev.type === 'light' ? (dev.color ?? '#f5a524') : dev.type === 'thermostat' ? (/cool/i.test(dev.state ?? '') ? ctx.theme.accent : '#eb6834') : dev.type === 'lock' ? ctx.theme.status.serious : ctx.theme.accent;
      const [onIcon, offIcon] = ICONS[dev.type];
      return html`<div class="${`sh-tile${active ? ' sh-on' : ''}`}" style="${`--glow:${glow}`}">
        <div class="sh-head">
          <span class="sh-ico">${icon(active ? onIcon : offIcon, { size: 19 })}</span>
          ${dev.battery != null && dev.battery < 20 ? html`<span class="sh-bat">${icon('battery-low', { size: 14 })}${`${Math.round(dev.battery)}%`}</span>` : null}
        </div>
        <div><div class="sh-name">${dev.name}</div><div class="sh-state">${stateText(dev, active)}</div></div>
        ${dev.type === 'light' && active && dev.brightness != null ? html`<div class="sh-bar"><span style="${style({ width: `${dev.brightness}%` })}"></span></div>` : null}
      </div>`;
    };
    return html`${header(d)}${areas.map(
      (a) => html`<section class="sh-area">
        ${a ? html`<div class="sh-area-h">${a}</div>` : null}
        <div class="sh-grid" style="${`grid-template-columns:repeat(${cols}, minmax(0, 1fr))`}">${d.devices.filter((x) => (x.area ?? '') === a).map(tile)}</div>
      </section>`,
    )}`;
  },
});
