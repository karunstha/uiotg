import { z } from 'zod';
import { imageUrlSchema } from '../../core/format.ts';
import { html, style } from '../../core/html.ts';
import { icon } from '../../core/icons.ts';
import { defineTemplate } from '../../core/types.ts';
import { imageBackground, initials } from '../../core/ui.ts';

export const profileCard = defineTemplate({
  id: 'profile_card',
  title: 'Profile card',
  category: 'media',
  photo: 'keyword',
  description:
    'A person, team, company or account card: banner, avatar (initials fallback), name, handle, bio, location/link/joined meta, tags and a row of stats. Use for user summaries, contact cards, GitHub/social profiles.',
  schema: z.object({
    name: z.string().min(1).max(80),
    handle: z.string().max(60).optional().describe('e.g. "@ada"'),
    headline: z.string().max(120).optional().describe('Role or one-line description, e.g. "Staff engineer at Acme"'),
    avatar_url: imageUrlSchema.optional(),
    banner_url: imageUrlSchema.optional(),
    bio: z.string().max(600).optional(),
    location: z.string().max(80).optional(),
    website: z.string().max(80).optional(),
    joined: z.string().max(40).optional().describe('e.g. "Joined March 2019"'),
    verified: z.boolean().default(false),
    tags: z.array(z.string().max(30)).max(10).optional(),
    stats: z
      .array(z.object({ label: z.string().max(30), value: z.union([z.number(), z.string().max(20)]) }))
      .max(5)
      .optional(),
  }),
  example: {
    name: 'Ada Okafor',
    handle: '@adaokafor',
    headline: 'Staff engineer · Developer platform',
    bio: 'Building fast, boring infrastructure. Previously compilers at a big search company. Writes about build systems and caching.',
    location: 'Lagos · Remote',
    website: 'ada.dev',
    joined: 'Joined March 2019',
    verified: true,
    tags: ['TypeScript', 'Rust', 'Bazel', 'Distributed systems'],
    stats: [
      { label: 'Repositories', value: 86 },
      { label: 'Followers', value: '12.4K' },
      { label: 'Stars earned', value: '31K' },
    ],
  },
  width: 600,
  padding: 0,
  css: /* css */ `
.pf-banner{height:150px}
.pf-body{padding:0 32px 30px}
.pf-avatar{width:104px;height:104px;border-radius:50%;margin-top:-52px;border:4px solid var(--surface);display:flex;align-items:center;
  justify-content:center;color:#fff;font-size:34px;font-weight:650;letter-spacing:-0.02em;background-color:var(--subtle)}
.pf-name{display:flex;align-items:center;gap:6px;margin-top:14px;font-size:24px;font-weight:700;letter-spacing:-0.02em;color:var(--text)}
.pf-name .icon{color:var(--accent)}
.pf-handle{font-size:15px;color:var(--text-2);margin-top:2px}
.pf-headline{font-size:15px;color:var(--text);margin-top:10px;font-weight:500}
.pf-bio{font-size:15px;line-height:1.55;color:var(--text-2);margin-top:8px}
.pf-meta{display:flex;flex-wrap:wrap;gap:6px 18px;margin-top:14px;font-size:13.5px;color:var(--text-2)}
.pf-meta span{display:inline-flex;align-items:center;gap:6px}
.pf-meta .icon{color:var(--muted)}
.pf-tags{display:flex;flex-wrap:wrap;gap:6px;margin-top:16px}
.pf-stats{display:flex;gap:36px;margin-top:22px;padding-top:18px;border-top:1px solid var(--grid)}
.pf-sv{font-size:20px;font-weight:650;letter-spacing:-0.015em;color:var(--text)}
.pf-sl{font-size:13px;color:var(--text-2);margin-top:1px}
`,
  render(d) {
    const banner = imageBackground(d.banner_url, `${d.name} banner`);
    return html`<div class="pf">
      <div class="pf-banner bg-img" style="${style({ 'background-image': banner })}"></div>
      <div class="pf-body">
        <div class="pf-avatar bg-img" style="${style({ 'background-image': imageBackground(d.avatar_url, d.name) })}">${d.avatar_url ? '' : initials(d.name)}</div>
        <div class="pf-name">${d.name}${d.verified ? icon('badge-check', { size: 22 }) : null}</div>
        ${d.handle ? html`<div class="pf-handle">${d.handle}</div>` : null}
        ${d.headline ? html`<div class="pf-headline">${d.headline}</div>` : null}
        ${d.bio ? html`<div class="pf-bio">${d.bio}</div>` : null}
        ${d.location || d.website || d.joined
          ? html`<div class="pf-meta">
              ${d.location ? html`<span>${icon('map-pin', { size: 14 })}${d.location}</span>` : null}
              ${d.website ? html`<span>${icon('link', { size: 14 })}${d.website}</span>` : null}
              ${d.joined ? html`<span>${icon('calendar', { size: 14 })}${d.joined}</span>` : null}
            </div>`
          : null}
        ${d.tags?.length ? html`<div class="pf-tags">${d.tags.map((t) => html`<span class="tag">${t}</span>`)}</div>` : null}
        ${d.stats?.length
          ? html`<div class="pf-stats">${d.stats.map(
              (s) => html`<div><div class="pf-sv">${typeof s.value === 'number' ? s.value.toLocaleString('en-US') : s.value}</div><div class="pf-sl">${s.label}</div></div>`,
            )}</div>`
          : null}
      </div>
    </div>`;
  },
});
