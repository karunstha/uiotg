import { z } from 'zod';
import { html } from '../../core/html.ts';
import { icon } from '../../core/icons.ts';
import { katexCss } from '../../core/katex.ts';
import { markdownBlocks, renderMarkdown } from '../../core/markdown.ts';
import { hiddenCount, moreLabel, withHidden } from '../../core/truncate.ts';
import { defineTemplate } from '../../core/types.ts';
import { CIRCLE_ROW, circleRow } from '../../core/ui.ts';

/** Blocks a round screen shows (truncateCircle). */
const KEEP = Symbol('blocks shown');

export const markdown = defineTemplate({
  id: 'markdown',
  title: 'Markdown document',
  summary: 'long formatted notes or report',
  category: 'text',
  description:
    'Renders a GitHub-flavored Markdown document (headings, lists, task lists, tables, quotes, highlighted code blocks, images). Use for notes, docs, READMEs and long-form answers.',
  schema: z.object({
    markdown: z.string().min(1).max(60_000),
    font_size: z.number().int().min(12).max(22).default(15).describe('Base text size in px'),
  }),
  example: {
    markdown: [
      '# Weekly sync',
      'Decisions and follow-ups from **Thursday’s** planning meeting.',
      '## Decisions',
      '1. Ship the new onboarding flow behind a flag',
      '2. Move the billing migration to next sprint',
      '## Follow-ups',
      '- [x] Draft rollout plan',
      '- [ ] Update the pricing page copy',
      '- [ ] Benchmark the import job',
      '| Owner | Task | Due |',
      '|---|---|---|',
      '| Priya | Rollout plan | Oct 12 |',
      '| Marco | Pricing copy | Oct 14 |',
      '```ts',
      'export const enabled = flags.get("onboarding-v2") ?? false;',
      '```',
      '> Keep the scope small; ship, measure, iterate.',
    ].join('\n'),
  },
  width: 800,
  padding: 40,
  css: /* css */ `${katexCss()}
.md-math{min-width:0}
.md-doc .md-code pre{border:0}
.md-doc .md-code{border-radius:calc(10px * var(--rk));overflow:hidden;border:1px solid var(--border)}
`,
  circleCss: /* css */ `
.md-r{display:flex;flex-direction:column;gap:8px}
.md-r .md-b > :first-child{margin-top:0}
.md-r .md-b > :last-child{margin-bottom:0}
.md-r h1{font-size:1.45em}
.md-r h2{font-size:1.15em}
.md-r h3,.md-r h4{font-size:1em}
.md-r h1,.md-r h2,.md-r h3,.md-r h4{margin:0;padding:0;border:0}
.md-r ul,.md-r ol{display:inline-block;text-align:left;margin:0;padding-left:1.4em}
.md-r ul:has(input[type=checkbox]){padding-left:0;list-style:none}
.md-r blockquote{margin:0;text-align:left}
.md-r img{max-width:100%;max-height:160px}
.md-ph{display:inline-flex;align-items:center;gap:6px;justify-content:center;font-size:0.87em;color:var(--text-2);background:var(--subtle);border-radius:var(--pill);padding:3px 12px}
.md-ph .icon{flex:none}
.md-more{font-size:13px;color:var(--text-2)}
`,
  truncateCircle(d, keep) {
    const total = markdownBlocks(d.markdown).length;
    const shown = Math.min(total, Math.max(1, Math.floor(keep)));
    return { data: Object.assign(withHidden({ ...d }, total - shown), { [KEEP]: shown }), total, shown };
  },
  async renderCircle(d, ctx) {
    // Line by line: each heading, paragraph, quote and list item is a row; tables and code become a one-line placeholder.
    const blocks = markdownBlocks(d.markdown).slice(0, (d as typeof d & { [KEEP]?: number })[KEEP]);
    const hidden = hiddenCount(d);
    const rows = await Promise.all(
      blocks.map(async (b) =>
        'placeholder' in b
          ? html`<div class="${circleRow('md-b')}"><span class="md-ph">${icon(b.icon, { size: 14 })}${b.placeholder}</span></div>`
          : html`<div class="${circleRow('md-b')}">${await renderMarkdown(b.markdown, ctx.theme.mode)}</div>`,
      ),
    );
    return html`<article class="prose md-doc md-r" style="${`font-size:${d.font_size}px`}">${rows}${hidden ? html`<div class="${`md-more ${CIRCLE_ROW}`}">${moreLabel(hidden)}</div>` : null}</article>`;
  },
  async render(d, ctx) {
    return html`<article class="prose md-doc" style="${`font-size:${d.font_size}px`}">${await renderMarkdown(d.markdown, ctx.theme.mode)}</article>`;
  },
});
