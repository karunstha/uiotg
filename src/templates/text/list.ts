import { z } from 'zod';
import { iconSchema, titleFields } from '../../core/format.ts';
import { html } from '../../core/html.ts';
import { icon } from '../../core/icons.ts';
import { renderInline } from '../../core/markdown.ts';
import { defineTemplate } from '../../core/types.ts';
import { header } from '../../core/ui.ts';

const ITEM_STATUS = {
  done: { icon: 'circle-check', color: 'var(--good)', label: 'Done' },
  in_progress: { icon: 'circle-dot', color: 'var(--accent)', label: 'In progress' },
  todo: { icon: 'circle', color: 'var(--muted)', label: 'To do' },
  blocked: { icon: 'circle-x', color: 'var(--critical)', label: 'Blocked' },
  skipped: { icon: 'circle-minus', color: 'var(--muted)', label: 'Skipped' },
} as const;

export const list = defineTemplate({
  id: 'list',
  title: 'List / checklist',
  category: 'text',
  photo: 'keyword',
  description:
    'A styled list: bullets, numbers, icons or a checklist with per-item status (done, in_progress, todo, blocked, skipped). Items can carry a description, a right-aligned meta value and a tag. Use for todos, steps, rankings and feature lists.',
  schema: z.object({
    ...titleFields,
    style: z.enum(['bullet', 'numbered', 'check', 'plain']).default('bullet').describe('"check" shows status icons; items with a status always do'),
    items: z
      .array(
        z.object({
          text: z.string().min(1).max(400).describe('Item text; inline Markdown supported'),
          description: z.string().max(800).optional(),
          status: z.enum(['done', 'in_progress', 'todo', 'blocked', 'skipped']).optional(),
          icon: iconSchema.optional().describe('Replaces the bullet with an icon'),
          meta: z.string().max(60).optional().describe('Right-aligned detail such as a date, count or owner'),
          tag: z.string().max(40).optional(),
        }),
      )
      .min(1)
      .max(60),
  }),
  example: {
    title: 'Launch checklist',
    subtitle: 'Mobile app v3.0 · target Oct 20',
    style: 'check',
    items: [
      { text: 'Finalize **App Store** screenshots', status: 'done', meta: 'Oct 6' },
      { text: 'Localize onboarding into 8 languages', status: 'done', meta: 'Oct 7' },
      { text: 'Load-test the sync service', description: 'Target p95 < 250 ms at 5k rps', status: 'in_progress', meta: 'Oct 10', tag: 'Backend' },
      { text: 'Security review sign-off', status: 'blocked', description: 'Waiting on the pen-test report', meta: 'Oct 13' },
      { text: 'Publish release notes', status: 'todo', meta: 'Oct 20' },
    ],
  },
  fit: 'content',
  minWidth: 320,
  width: 640,
  css: /* css */ `
.ls{display:flex;flex-direction:column}
.ls-item{display:grid;grid-template-columns:24px 1fr auto;column-gap:12px;align-items:start;padding:11px 0}
.ls-item + .ls-item{border-top:1px solid var(--grid)}
.ls-mark{height:22px;display:flex;align-items:center;justify-content:center;color:var(--text-2)}
.ls-bullet{width:6px;height:6px;border-radius:50%;background:var(--muted)}
.ls-num{font-size:13px;font-weight:600;color:var(--muted);font-variant-numeric:tabular-nums}
.ls-text{font-size:15px;line-height:22px;color:var(--text)}
.ls-text code{font-family:var(--font-mono);font-size:.88em;background:var(--subtle);padding:.1em .35em;border-radius:4px}
.ls-text strong{font-weight:620}
.ls-item.ls-done .ls-text,.ls-item.ls-skipped .ls-text{color:var(--text-2)}
.ls-desc{margin-top:2px;font-size:13px;line-height:19px;color:var(--text-2)}
.ls-right{display:flex;align-items:center;gap:8px;height:22px}
.ls-meta{font-size:13px;color:var(--muted);white-space:nowrap;font-variant-numeric:tabular-nums}
.ls-main{min-width:0}
.ls-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
`,
  render(d) {
    const showStatus = d.style === 'check' || d.items.some((i) => i.status);
    return html`${header(d)}<div class="ls">${d.items.map((item, i) => {
      const st = showStatus ? ITEM_STATUS[item.status ?? 'todo'] : null;
      let mark;
      if (item.icon) mark = icon(item.icon, { size: 18 });
      else if (st) mark = html`<span style="${`color:${st.color}`}">${icon(st.icon, { size: 18 })}</span>`;
      else if (d.style === 'numbered') mark = html`<span class="ls-num">${i + 1}</span>`;
      else if (d.style === 'bullet') mark = html`<span class="ls-bullet"></span>`;
      return html`<div class="${`ls-item${item.status ? ` ls-${item.status}` : ''}`}">
        <div class="ls-mark">${mark}</div>
        <div class="ls-main">
          <div class="ls-text">${renderInline(item.text)}</div>
          ${item.description ? html`<div class="ls-desc">${item.description}</div>` : null}
        </div>
        <div class="ls-right">
          ${item.tag ? html`<span class="tag">${item.tag}</span>` : null}
          ${item.meta ? html`<span class="ls-meta">${item.meta}</span>` : null}
        </div>
      </div>`;
    })}</div>`;
  },
});
