import { z } from 'zod';
import { titleFields } from '../../core/format.ts';
import { html } from '../../core/html.ts';
import { katexCss, tex } from '../../core/katex.ts';
import { renderInline } from '../../core/markdown.ts';
import { defineTemplate } from '../../core/types.ts';
import { header } from '../../core/ui.ts';

export const math = defineTemplate({
  id: 'math',
  title: 'Math / formulas',
  category: 'text',
  description:
    'Typeset math (LaTeX via KaTeX): one formula, or a worked solution as a sequence of steps with a note beside each. Use for equations, derivations, proofs and calculations. (Markdown documents also support $inline$ and $$block$$ math.)',
  schema: z.object({
    ...titleFields,
    expressions: z
      .array(
        z.object({
          tex: z.string().min(1).max(2000).describe('LaTeX, without surrounding $ signs, e.g. "x = \\\\frac{-b \\\\pm \\\\sqrt{b^2-4ac}}{2a}"'),
          note: z.string().max(200).optional().describe('Explanation shown beside the step; inline Markdown supported'),
        }),
      )
      .min(1)
      .max(30),
    size: z.enum(['md', 'lg']).default('md'),
  }),
  example: {
    title: 'Solving 2x² − 8x + 6 = 0',
    expressions: [
      { tex: '2x^2 - 8x + 6 = 0', note: 'Start from the equation' },
      { tex: 'x^2 - 4x + 3 = 0', note: 'Divide both sides by 2' },
      { tex: 'x = \\frac{4 \\pm \\sqrt{16 - 12}}{2}', note: 'Quadratic formula with *a* = 1, *b* = −4, *c* = 3' },
      { tex: 'x = 1 \\quad\\text{or}\\quad x = 3', note: '**Solutions**' },
    ],
  },
  width: 720,
  css: /* css */ `${katexCss()}
.mx{display:grid;row-gap:6px}
.mx.notes{row-gap:0}
.mx.notes .mx-eq,.mx.notes .mx-note{display:flex;align-items:center;padding:4px 0}
.mx.notes{grid-template-columns:minmax(0, auto) 1fr;column-gap:28px}
.mx-eq{color:var(--text);min-width:0}
.mx:not(.notes) .mx-eq{text-align:center}
.mx-eq .katex-display{margin:6px 0}
.mx.notes .mx-eq .katex-display{text-align:left}
.mx.notes .mx-eq .katex-display > .katex{text-align:left}
.mx-note{font-size:14px;color:var(--text-2);line-height:1.4}
.mx-note strong{color:var(--text)}
.mx-row{display:contents}
.mx.notes .mx-row + .mx-row > *{border-top:1px solid var(--grid)}
`,
  render(d) {
    const notes = d.expressions.some((e) => e.note);
    return html`${header(d)}<div class="${`mx${notes ? ' notes' : ''}`}" style="${`font-size:${d.size === 'lg' ? 22 : 18}px`}">${d.expressions.map(
      (e) => html`<div class="mx-row"><div class="mx-eq">${tex(e.tex, true)}</div>${notes ? html`<div class="mx-note"><span>${e.note ? renderInline(e.note) : ''}</span></div>` : null}</div>`,
    )}</div>`;
  },
});
