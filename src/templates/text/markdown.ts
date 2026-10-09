import { z } from 'zod';
import { html } from '../../core/html.ts';
import { katexCss } from '../../core/katex.ts';
import { renderMarkdown } from '../../core/markdown.ts';
import { defineTemplate } from '../../core/types.ts';

export const markdown = defineTemplate({
  id: 'markdown',
  title: 'Markdown document',
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
.md-math{overflow:hidden}
.md-doc .md-code pre{border:0}
.md-doc .md-code{border-radius:10px;overflow:hidden;border:1px solid var(--border)}
`,
  async render(d, ctx) {
    return html`<article class="prose md-doc" style="${`font-size:${d.font_size}px`}">${await renderMarkdown(d.markdown, ctx.theme.mode)}</article>`;
  },
});
