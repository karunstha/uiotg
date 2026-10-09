import { z } from 'zod';
import { titleFields, toneSchema } from '../../core/format.ts';
import { html, style } from '../../core/html.ts';
import { icon } from '../../core/icons.ts';
import { defineTemplate } from '../../core/types.ts';
import { header, imageBackground, initials, toneColor } from '../../core/ui.ts';

const PRIORITY = {
  urgent: { icon: 'flame', color: 'var(--critical)', label: 'Urgent' },
  high: { icon: 'chevrons-up', color: 'var(--serious)', label: 'High' },
  medium: { icon: 'equal', color: 'var(--warning)', label: 'Medium' },
  low: { icon: 'chevron-down', color: 'var(--muted)', label: 'Low' },
} as const;

/** Column color from its name when no tone is given: done → green, in progress → accent, blocked → red. */
function columnTone(name: string): 'success' | 'accent' | 'critical' | 'neutral' {
  if (/done|complete|shipped|closed|resolved/i.test(name)) return 'success';
  if (/progress|doing|review|active|started/i.test(name)) return 'accent';
  if (/block|stuck|risk/i.test(name)) return 'critical';
  return 'neutral';
}

export const taskBoard = defineTemplate({
  id: 'task_board',
  title: 'Task board',
  category: 'data',
  description:
    'A kanban board: columns of cards with tags, assignee, priority, due date and progress, plus per-column counts and WIP limits. Use for sprint and project summaries, backlogs and pipelines.',
  schema: z.object({
    ...titleFields,
    columns: z
      .array(
        z.object({
          name: z.string().min(1).max(40),
          tone: toneSchema.optional().describe('Column color; inferred from the name when omitted'),
          limit: z.number().int().min(1).optional().describe('WIP limit; the count turns red when exceeded'),
          cards: z
            .array(
              z.object({
                title: z.string().min(1).max(160),
                description: z.string().max(300).optional(),
                tags: z.array(z.string().max(24)).max(4).optional(),
                assignee: z.string().max(60).optional().describe('Name, shown as initials'),
                priority: z.enum(['urgent', 'high', 'medium', 'low']).optional(),
                due: z.string().max(30).optional(),
                progress: z.number().min(0).max(1).optional().describe('0–1'),
              }),
            )
            .max(30),
        }),
      )
      .min(1)
      .max(6),
  }),
  example: {
    title: 'Sprint 42',
    subtitle: 'Oct 6 – Oct 17 · 9 of 14 points done',
    columns: [
      {
        name: 'To do',
        cards: [
          { title: 'Rate-limit the public API', tags: ['backend'], assignee: 'Marco Rossi', priority: 'high', due: 'Oct 15' },
          { title: 'Update pricing page copy', tags: ['web'], assignee: 'Lena Park', priority: 'low' },
        ],
      },
      {
        name: 'In progress',
        limit: 2,
        cards: [
          { title: 'EU data residency', description: 'Replicate storage buckets and route EU tenants.', tags: ['infra'], assignee: 'Priya Shah', priority: 'urgent', progress: 0.6 },
          { title: 'Onboarding v2 flows', tags: ['web', 'design'], assignee: 'Lena Park', priority: 'medium', progress: 0.3, due: 'Oct 16' },
        ],
      },
      {
        name: 'Done',
        cards: [
          { title: 'SSO for Business plans', tags: ['auth'], assignee: 'Ada Okafor' },
          { title: 'Fix CSV export timezone bug', tags: ['bug'], assignee: 'Marco Rossi' },
        ],
      },
    ],
  },
  width: (d) => Math.min(1600, Math.max(640, d.columns.length * 280 + (d.columns.length - 1) * 14 + 64)),
  background: 'plane',
  css: /* css */ `
.kb-board{display:grid;gap:14px;align-items:start}
.kb-col{background:color-mix(in srgb, var(--subtle) 70%, transparent);border-radius:14px;padding:10px}
.kb-colhead{display:flex;align-items:center;gap:8px;padding:4px 6px 10px;font-size:13.5px;font-weight:650;color:var(--text)}
.kb-dot{width:8px;height:8px;border-radius:50%}
.kb-count{margin-left:auto;font-size:12px;font-weight:600;color:var(--text-2);background:var(--surface);border-radius:999px;padding:1px 8px;
  font-variant-numeric:tabular-nums}
.kb-count.kb-over{color:#fff;background:var(--critical)}
.kb-cards{display:flex;flex-direction:column;gap:8px}
.kb-card{background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:10px 12px;box-shadow:0 1px 2px rgba(0,0,0,.04)}
.kb-ct{font-size:14px;font-weight:600;line-height:1.35;color:var(--text)}
.kb-cd{font-size:12.5px;line-height:1.4;color:var(--text-2);margin-top:3px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.kb-tags{display:flex;flex-wrap:wrap;gap:4px;margin-top:8px}
.kb-tags .tag{font-size:11px;padding:1px 7px;line-height:16px}
.kb-prog{height:4px;border-radius:999px;background:var(--subtle);margin-top:9px;overflow:hidden}
.kb-prog span{display:block;height:100%;background:var(--accent);border-radius:999px}
.kb-meta{display:flex;align-items:center;gap:10px;margin-top:9px;font-size:12px;color:var(--text-2)}
.kb-meta > span{display:inline-flex;align-items:center;gap:4px}
.kb-who{margin-left:auto;width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;
  font-size:10px;font-weight:700}
.kb-empty{font-size:12.5px;color:var(--muted);text-align:center;padding:12px 0}
`,
  render(d, ctx) {
    return html`${header(d)}<div class="kb-board" style="${`grid-template-columns:repeat(${d.columns.length}, minmax(0, 1fr))`}">${d.columns.map((col) => {
      const over = col.limit != null && col.cards.length > col.limit;
      const tone = col.tone ?? columnTone(col.name);
      const done = tone === 'success';
      return html`<div class="kb-col">
        <div class="kb-colhead"><span class="kb-dot" style="${style({ background: toneColor(ctx.theme, tone) })}"></span>${col.name}<span class="${`kb-count${over ? ' kb-over' : ''}`}">${col.cards.length}${col.limit ? ` / ${col.limit}` : ''}</span></div>
        <div class="kb-cards">${col.cards.length
          ? col.cards.map((c) => {
              const p = c.priority && !done ? PRIORITY[c.priority] : null;
              return html`<div class="kb-card">
                <div class="kb-ct">${c.title}</div>
                ${c.description ? html`<div class="kb-cd">${c.description}</div>` : null}
                ${c.tags?.length ? html`<div class="kb-tags">${c.tags.map((t) => html`<span class="tag">${t}</span>`)}</div>` : null}
                ${c.progress != null && !done ? html`<div class="kb-prog"><span style="${`width:${Math.round(c.progress * 100)}%`}"></span></div>` : null}
                ${p || c.due || c.assignee || done
                  ? html`<div class="kb-meta">
                      ${done ? html`<span style="color:var(--good)">${icon('circle-check', { size: 13 })}Done</span>` : null}
                      ${p ? html`<span><span style="${`color:${p.color};display:inline-flex`}">${icon(p.icon, { size: 13, strokeWidth: 2.5 })}</span>${p.label}</span>` : null}
                      ${c.due && !done ? html`<span>${icon('calendar', { size: 12 })}${c.due}</span>` : null}
                      ${c.assignee ? html`<span class="kb-who" style="${style({ background: imageBackground(undefined, c.assignee) })}">${initials(c.assignee)}</span>` : null}
                    </div>`
                  : null}
              </div>`;
            })
          : html`<div class="kb-empty">No cards</div>`}</div>
      </div>`;
    })}</div>`;
  },
});
