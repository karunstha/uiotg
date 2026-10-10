import { z } from 'zod';
import { colorSchema, titleFields, toneSchema } from '../../core/format.ts';
import { centeredViewport, fitViewport, tilesFor, toScreen, type LatLon } from '../../core/geo.ts';
import { html, raw, style } from '../../core/html.ts';
import { measureText } from '../../core/measure.ts';
import { defineTemplate } from '../../core/types.ts';
import { header, headerHeight, toneColor } from '../../core/ui.ts';
import { seriesColor } from '../../core/theme.ts';
import { DEFAULT_TILES, TILE_ATTRIBUTION, tileHref } from '../../core/tiles.ts';

const point = z.object({ lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180) });

export const map = defineTemplate({
  id: 'map',
  title: 'Map',
  category: 'media',
  description:
    'A street map with labeled pins and routes, automatically framed to fit them. Give coordinates (lat/lon), not addresses. Use for locations, store finders, trip plans, deliveries and "where is…" answers.',
  schema: z
    .object({
      ...titleFields,
      markers: z
        .array(
          point.extend({
            label: z.string().max(60).optional(),
            tone: toneSchema.optional(),
            color: colorSchema.optional(),
          }),
        )
        .max(300)
        .optional(),
      routes: z
        .array(
          z.object({
            points: z.array(z.tuple([z.number(), z.number()])).min(2).max(5000).describe('[[lat, lon], …] in order'),
            label: z.string().max(60).optional(),
            color: colorSchema.optional(),
          }),
        )
        .max(5)
        .optional(),
      center: point.optional().describe('Override the automatic framing'),
      zoom: z.number().int().min(1).max(19).optional(),
      height: z.number().int().min(160).max(1200).default(440).describe('Map height in px'),
      style: z.enum(['auto', 'light', 'dark', 'original']).default('auto').describe('Basemap look: auto follows the theme; original keeps the provider’s colors'),
    })
    .refine((d) => d.markers?.length || d.routes?.length || d.center, { message: 'Give markers, routes or a center' }),
  example: {
    title: 'Coffee near the office',
    subtitle: 'Three favorites within a 10-minute walk',
    markers: [
      { lat: 51.5246, lon: -0.0835, label: 'Office', tone: 'accent' },
      { lat: 51.5261, lon: -0.0782, label: 'Ozone Coffee' },
      { lat: 51.5214, lon: -0.0778, label: 'Allpress' },
      { lat: 51.5233, lon: -0.0897, label: 'Workshop Coffee' },
    ],
    routes: [
      {
        label: 'Walk to Ozone',
        points: [
          [51.5246, -0.0835],
          [51.5252, -0.0815],
          [51.5258, -0.0798],
          [51.5261, -0.0782],
        ],
      },
    ],
  },
  width: 800,
  css: /* css */ `
.mp{position:relative;overflow:hidden;border-radius:12px;border:1px solid var(--border);background:var(--subtle)}
.mp-tile{position:absolute;width:256px;height:256px;max-width:none}
.mp svg{position:absolute;inset:0}
.mp-lbl{position:absolute;font-size:12px;line-height:16px;font-weight:600;color:var(--text);text-align:center;
  background:var(--surface);padding:3px 8px;border-radius:10px;box-shadow:0 1px 4px rgba(0,0,0,.2)}
.mp-attr{position:absolute;right:0;bottom:0;font-size:10px;color:#555;background:rgba(255,255,255,.75);padding:1px 6px;border-top-left-radius:6px}
.mp-key{display:flex;gap:16px;flex-wrap:wrap;margin-top:10px;font-size:12.5px;color:var(--text-2)}
.mp-key span{display:inline-flex;align-items:center;gap:6px}
.mp-key i{display:inline-block;width:16px;height:4px;border-radius:2px}
`,
  render(d, ctx) {
    const { theme } = ctx;
    const width = Math.round(ctx.width);
    const height = Math.round(ctx.height ? Math.max(160, ctx.height - headerHeight(d)) : d.height);
    const markers = d.markers ?? [];
    const routes = (d.routes ?? []).map((r, i) => ({ ...r, latlon: r.points.map(([lat, lon]) => ({ lat, lon })), color: r.color ?? seriesColor(theme, i + 1) }));
    const all: LatLon[] = [...markers, ...routes.flatMap((r) => r.latlon)];
    const dense = markers.length > 30;
    const view =
      d.center && d.zoom
        ? centeredViewport(d.center, d.zoom, width, height)
        : fitViewport(all.length ? all : [d.center!], width, height, dense ? 24 : 56, 17, d.zoom ?? 15);
    // The default basemap has one (light) style: calm it for light, invert it for dark.
    const look = d.style === 'auto' ? theme.mode : d.style;
    const filter = !DEFAULT_TILES || look === 'original' ? undefined : look === 'dark' ? 'invert(1) hue-rotate(180deg) brightness(0.9) contrast(0.9) saturate(0.6)' : 'saturate(0.55) contrast(0.95)';

    const tiles = tilesFor(view).map(
      (t) => html`<img class="mp-tile" alt="" src="${tileHref(t.z, t.x, t.y)}" style="${style({ left: Math.round(t.left), top: Math.round(t.top), filter })}">`,
    );

    // Routes: a surface-colored casing under a 4px line keeps them legible on any basemap.
    let svg = '';
    for (const r of routes) {
      const pts = r.latlon.map((p) => toScreen(p, view)).map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
      svg += `<polyline points="${pts}" fill="none" stroke="${theme.surface}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" opacity="0.9"/>`;
      svg += `<polyline points="${pts}" fill="none" stroke="${r.color}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`;
    }
    const labels = [];
    for (const m of markers) {
      const p = toScreen(m, view);
      const c = m.color ?? (m.tone ? toneColor(theme, m.tone) : theme.series[0]!);
      if (dense) {
        svg += `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="5" fill="${c}" stroke="${theme.surface}" stroke-width="2"/>`;
        continue;
      }
      // Teardrop pin with its tip on the point.
      svg += `<g transform="translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})"><path d="M0 0C-2-6-11-11-11-19a11 11 0 0 1 22 0C11-11 2-6 0 0z" fill="${c}" stroke="${theme.surface}" stroke-width="2"/><circle cy="-19" r="4" fill="${theme.surface}"/></g>`;
      if (m.label) {
        // Keep the whole label inside the map: wrap long ones, slide them in from the edges,
        // and put them above the pin near the bottom.
        const maxW = Math.min(220, width - 16);
        const textW = measureText(m.label, 12, true) + 18;
        const w = Math.min(maxW, textW);
        const lines = Math.ceil(textW / maxW) + (textW > maxW ? 1 : 0);
        const h = lines * 16 + 6;
        const left = Math.max(8, Math.min(width - w - 8, p.x - w / 2));
        const top = p.y + 6 + h > height - 8 ? Math.max(8, p.y - 30 - h) : p.y + 6;
        labels.push(html`<span class="mp-lbl" style="${style({ left: Math.round(left), top: Math.round(top), width: Math.round(w) })}">${m.label}</span>`);
      }
    }
    const key = routes.filter((r) => r.label);
    return html`${header(d)}
    <div class="mp" style="${style({ width, height })}">
      ${tiles}
      ${raw(`<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" aria-hidden="true">${svg}</svg>`)}
      ${labels}
      <span class="mp-attr">${TILE_ATTRIBUTION}</span>
    </div>
    ${key.length ? html`<div class="mp-key">${key.map((r) => html`<span><i style="${`background:${r.color}`}"></i>${r.label}</span>`)}</div>` : null}`;
  },
});
