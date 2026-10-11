import { z } from 'zod';
import { iconSchema, titleFields } from '../../core/format.ts';
import { html } from '../../core/html.ts';
import { icon } from '../../core/icons.ts';
import { renderInline } from '../../core/markdown.ts';
import { defineTemplate } from '../../core/types.ts';
import { header } from '../../core/ui.ts';

export const timeline = defineTemplate({
  id: 'timeline',
  title: 'Timeline',
  category: 'data',
  photo: 'keyword',
  description:
    'A vertical timeline of dated events with done / current / upcoming / blocked states. Use for roadmaps, changelogs, incident timelines, histories and itineraries.',
  schema: z.object({
    ...titleFields,
    events: z
      .array(
        z.object({
          date: z.string().max(40).describe('Display date or time, e.g. "Mar 2024" or "14:05"'),
          title: z.string().min(1).max(200),
          description: z.string().max(800).optional().describe('Inline Markdown supported'),
          status: z.enum(['done', 'current', 'upcoming', 'blocked']).optional(),
          icon: iconSchema.optional(),
          tag: z.string().max(40).optional(),
        }),
      )
      .min(1)
      .max(40),
  }),
  example: {
    title: 'Incident #2291 · API latency',
    subtitle: 'All times UTC, October 8',
    events: [
      { date: '13:58', title: 'Alert fired', description: 'p95 latency on `/v2/search` crossed 800 ms', status: 'done', icon: 'bell' },
      { date: '14:04', title: 'Incident declared', description: 'On-call paged the search team', status: 'done' },
      { date: '14:21', title: 'Root cause identified', description: 'A cache node was evicting hot keys after a config push', status: 'done', tag: 'Root cause' },
      { date: '14:35', title: 'Mitigation deployed', description: 'Config rolled back; latency recovering', status: 'current' },
      { date: 'Oct 10', title: 'Post-incident review', status: 'upcoming' },
    ],
  },
  fit: 'content',
  minWidth: 320,
  width: 720,
  css: /* css */ `
.tl{display:grid;grid-template-columns:auto 28px 1fr;column-gap:14px}
.tl-date{font-size:13px;font-weight:500;color:var(--text-2);text-align:right;padding-top:2px;white-space:nowrap;
  font-variant-numeric:tabular-nums}
.tl-rail{position:relative;display:flex;justify-content:center}
.tl-rail::before{content:'';position:absolute;top:0;bottom:0;width:2px;background:var(--grid)}
.tl-row:first-child .tl-rail::before{top:10px}
.tl-row:last-child .tl-rail::before{bottom:auto;height:10px}
.tl-row{display:contents}
.tl-dot{position:relative;margin-top:4px;width:14px;height:14px;border-radius:50%;background:var(--surface);
  border:2px solid var(--axis);box-shadow:0 0 0 3px var(--surface)}
.tl-dot.done{background:var(--accent);border-color:var(--accent)}
.tl-dot.current{border-color:var(--accent);box-shadow:0 0 0 3px var(--surface),0 0 0 6px color-mix(in srgb, var(--accent) 25%, transparent)}
.tl-dot.blocked{background:var(--critical);border-color:var(--critical)}
.tl-ico{position:relative;width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;
  background:var(--subtle);color:var(--text-2);box-shadow:0 0 0 3px var(--surface)}
.tl-ico.done{background:var(--accent);color:var(--on-accent)}
.tl-ico.current{background:color-mix(in srgb, var(--accent) 16%, var(--surface));color:var(--accent)}
.tl-ico.blocked{background:var(--critical);color:#fff}
.tl-body{padding-bottom:22px;min-width:0}
.tl-row:last-child .tl-body{padding-bottom:0}
.tl-title{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:15px;font-weight:600;line-height:22px;color:var(--text)}
.tl-row.upcoming .tl-title{color:var(--text-2)}
.tl-desc{margin-top:3px;font-size:13.5px;line-height:20px;color:var(--text-2)}
.tl-desc code{font-family:var(--font-mono);font-size:.88em;background:var(--subtle);padding:.1em .35em;border-radius:calc(4px * var(--rk))}
`,
  render(d) {
    return html`${header(d)}<div class="tl">${d.events.map((e) => {
      const status = e.status ?? '';
      return html`<div class="${`tl-row ${status}`}">
        <div class="tl-date">${e.date}</div>
        <div class="tl-rail">${e.icon
          ? html`<span class="${`tl-ico ${status}`}">${icon(e.icon, { size: 14 })}</span>`
          : html`<span class="${`tl-dot ${status}`}"></span>`}</div>
        <div class="tl-body">
          <div class="tl-title">${e.title}${e.tag ? html`<span class="tag">${e.tag}</span>` : null}</div>
          ${e.description ? html`<div class="tl-desc">${renderInline(e.description)}</div>` : null}
        </div>
      </div>`;
    })}</div>`;
  },
});
