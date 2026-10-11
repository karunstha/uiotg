import { z } from 'zod';
import { imageUrlSchema } from '../../core/format.ts';
import { html, style } from '../../core/html.ts';
import { icon } from '../../core/icons.ts';
import { defineTemplate } from '../../core/types.ts';
import { imageBackground } from '../../core/ui.ts';

function seconds(t?: string): number | null {
  if (!t) return null;
  const parts = t.split(':').map(Number);
  if (parts.some((p) => !Number.isFinite(p))) return null;
  return parts.reduce((acc, p) => acc * 60 + p, 0);
}

function clock(total: number): string {
  const m = Math.floor(total / 60);
  const s = Math.round(total % 60);
  return m >= 60 ? `${Math.floor(m / 60)} hr ${m % 60} min` : `${m} min${s && m < 10 ? ` ${s} sec` : ''}`;
}

export const albumCard = defineTemplate({
  id: 'album_card',
  title: 'Album / now playing',
  summary: 'a track, album or now playing',
  category: 'media',
  description:
    'Album art card with an ambient backdrop blurred from the cover. Three layouts: "now_playing" (playback position), "track" (single track info) and "album" (cover, metadata and track list). Covers fall back to a generated gradient.',
  schema: z.object({
    title: z.string().min(1).max(160).describe('Track title (now_playing/track) or album title (album)'),
    artist: z.string().min(1).max(160),
    album: z.string().max(160).optional().describe('Album name when `title` is a track'),
    cover_url: imageUrlSchema.optional().describe('Square cover art URL'),
    layout: z.enum(['now_playing', 'track', 'album']).optional().describe('Default: album if tracks are given, now_playing if progress/elapsed is, else track'),
    year: z.union([z.number().int(), z.string().max(20)]).optional(),
    genre: z.string().max(60).optional(),
    label: z.string().max(80).optional().describe('Record label'),
    tags: z.array(z.string().max(30)).max(6).optional().describe('e.g. "Explicit", "Hi-Res Lossless"'),
    progress: z.number().min(0).max(1).optional().describe('Playback position 0–1 (or give elapsed + duration)'),
    elapsed: z.string().max(10).optional().describe('e.g. "1:24"'),
    duration: z.string().max(10).optional().describe('e.g. "3:45"'),
    tracks: z
      .array(
        z.object({
          title: z.string().min(1).max(160),
          duration: z.string().max(10).optional(),
          artist: z.string().max(160).optional().describe('Featured or track artist when it differs'),
          playing: z.boolean().optional(),
        }),
      )
      .max(40)
      .optional(),
  }),
  example: {
    layout: 'album',
    title: 'Midnight Transit',
    artist: 'The Night Lines',
    cover_url: 'https://picsum.photos/seed/uiotg-album/600/600',
    year: 2026,
    genre: 'Synth-pop',
    label: 'Northbound Records',
    tags: ['Hi-Res Lossless'],
    tracks: [
      { title: 'Last Train Out', duration: '3:42' },
      { title: 'Neon Platform', duration: '4:05', playing: true },
      { title: 'Signals', duration: '3:18', artist: 'feat. Aya' },
      { title: 'Underpass', duration: '5:01' },
      { title: 'City Lights Fade', duration: '4:27' },
      { title: 'Terminal', duration: '6:12' },
    ],
  },
  width: (d) => ((d.layout ?? (d.tracks?.length ? 'album' : '')) === 'album' ? 820 : 720),
  padding: 0,
  css: /* css */ `
.al{position:relative;overflow:hidden;isolation:isolate}
.al-bg{position:absolute;inset:-120px;z-index:-2;background-size:cover;background-position:center;filter:blur(70px) saturate(1.6);
  opacity:.85}
.al-veil{position:absolute;inset:0;z-index:-1;background:color-mix(in srgb, var(--surface) 64%, transparent)}
.al-body{padding:36px}
.al-top{display:grid;grid-template-columns:auto 1fr;gap:34px;align-items:center}
.al-cover{border-radius:calc(10px * var(--rk));display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,.55);
  box-shadow:0 22px 50px -16px rgba(0,0,0,.5),0 0 0 1px rgba(0,0,0,.06)}
.al-eyebrow{display:flex;align-items:center;gap:8px;font-size:12px;font-weight:650;letter-spacing:.1em;text-transform:uppercase;color:var(--text-2)}
.al-title{font-size:34px;font-weight:720;letter-spacing:-0.028em;line-height:1.08;margin-top:10px;color:var(--text);text-wrap:balance}
.al-artist{font-size:19px;font-weight:550;color:var(--text);opacity:.82;margin-top:8px}
.al-meta{font-size:13px;color:var(--text-2);margin-top:10px}
.al-tags{display:flex;gap:6px;flex-wrap:wrap;margin-top:14px}
.al-tags .tag{background:color-mix(in srgb, var(--text) 9%, transparent);color:var(--text)}
.al-progress{margin-top:26px}
.al-track{position:relative;height:5px;border-radius:var(--pill);background:color-mix(in srgb, var(--text) 16%, transparent)}
.al-fill{position:absolute;left:0;top:0;bottom:0;border-radius:var(--pill);background:var(--text)}
.al-times{display:flex;justify-content:space-between;margin-top:9px;font-size:12px;color:var(--text-2);font-variant-numeric:tabular-nums}
.al-list{margin-top:30px;border-top:1px solid color-mix(in srgb, var(--text) 12%, transparent)}
.al-row{display:grid;grid-template-columns:28px 1fr auto;gap:14px;align-items:center;padding:11px 8px;border-radius:calc(8px * var(--rk))}
.al-row + .al-row{box-shadow:inset 0 1px 0 color-mix(in srgb, var(--text) 7%, transparent)}
.al-row.on{background:color-mix(in srgb, var(--text) 8%, transparent);box-shadow:none}
.al-row.on + .al-row{box-shadow:none}
.al-num{font-size:14px;color:var(--text-2);text-align:center;font-variant-numeric:tabular-nums}
.al-row.on .al-num{color:var(--accent)}
.al-tt{font-size:15px;font-weight:500;color:var(--text)}
.al-row.on .al-tt{color:var(--accent);font-weight:600}
.al-ta{font-size:13px;color:var(--text-2);margin-top:1px}
.al-dur{font-size:13px;color:var(--text-2);font-variant-numeric:tabular-nums}
`,
  render(d) {
    const layout = d.layout ?? (d.tracks?.length ? 'album' : d.progress != null || d.elapsed ? 'now_playing' : 'track');
    const seed = `${d.artist} ${d.album ?? d.title}`;
    const bg = imageBackground(d.cover_url, seed);
    const coverSize = layout === 'album' ? 232 : 220;
    const cover = html`<div class="al-cover bg-img" style="${style({ width: coverSize, height: coverSize, 'background-image': bg })}">${
      d.cover_url ? null : icon('disc-3', { size: 64, strokeWidth: 1.25 })
    }</div>`;

    const total = (d.tracks ?? []).reduce((s, t) => s + (seconds(t.duration) ?? 0), 0);
    const meta = [
      layout === 'album' ? null : d.album,
      d.year != null ? String(d.year) : null,
      d.genre,
      layout === 'album' && d.tracks?.length ? `${d.tracks.length} songs${total ? `, ${clock(total)}` : ''}` : null,
      d.label,
    ].filter(Boolean);

    let progress = null;
    if (layout === 'now_playing') {
      const el = seconds(d.elapsed);
      const du = seconds(d.duration);
      const p = d.progress ?? (el != null && du ? el / du : 0);
      const pct = `${(Math.max(0, Math.min(1, p)) * 100).toFixed(2)}%`;
      progress = html`<div class="al-progress">
        <div class="al-track"><div class="al-fill" style="${`width:${pct}`}"></div></div>
        ${d.elapsed || d.duration ? html`<div class="al-times"><span>${d.elapsed ?? ''}</span><span>${d.duration ?? ''}</span></div>` : null}
      </div>`;
    }

    const eyebrow = layout === 'now_playing' ? 'Now playing' : layout === 'album' ? 'Album' : 'Track';
    return html`<div class="al">
      <div class="al-bg" style="${style({ 'background-image': bg })}"></div>
      <div class="al-veil"></div>
      <div class="al-body">
        <div class="al-top">
          ${cover}
          <div>
            <div class="al-eyebrow">${icon(layout === 'now_playing' ? 'audio-lines' : 'disc-3', { size: 14 })}${eyebrow}</div>
            <div class="al-title">${d.title}</div>
            <div class="al-artist">${d.artist}</div>
            ${meta.length ? html`<div class="al-meta">${meta.join(' · ')}</div>` : null}
            ${d.tags?.length ? html`<div class="al-tags">${d.tags.map((t) => html`<span class="tag">${t}</span>`)}</div>` : null}
            ${progress}
          </div>
        </div>
        ${d.tracks?.length
          ? html`<div class="al-list">${d.tracks.map(
              (t, i) => html`<div class="${`al-row${t.playing ? ' on' : ''}`}">
                <div class="al-num">${t.playing ? icon('audio-lines', { size: 16 }) : i + 1}</div>
                <div><div class="al-tt">${t.title}</div>${t.artist ? html`<div class="al-ta">${t.artist}</div>` : null}</div>
                <div class="al-dur">${t.duration ?? ''}</div>
              </div>`,
            )}</div>`
          : null}
      </div>
    </div>`;
  },
});

