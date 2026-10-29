import { Marked, type Token, type Tokens } from 'marked';
import { raw, type Html } from './html.ts';
import { defaultCodeTheme, highlight } from './highlight.ts';
import { tex } from './katex.ts';
import type { Mode } from './theme.ts';

const marked = new Marked({ gfm: true, breaks: false });

// $$block$$ and $inline$ math, rendered server-side with KaTeX. Inline math must
// hug its content ("$x$", not "$ x $") and not precede a digit, so prices like
// "$5 and $10" stay text.
marked.use({
  extensions: [
    {
      name: 'mathBlock',
      level: 'block',
      start: (src: string) => src.match(/^\$\$/m)?.index,
      tokenizer(src: string) {
        const m = /^\$\$\s*([\s\S]+?)\s*\$\$(?:\n|$)/.exec(src);
        return m ? { type: 'mathBlock', raw: m[0], text: m[1]! } : undefined;
      },
      renderer: (token) => `<div class="md-math">${tex(token.text as string, true).value}</div>`,
    },
    {
      name: 'mathInline',
      level: 'inline',
      start: (src: string) => src.indexOf('$') >= 0 ? src.indexOf('$') : undefined,
      tokenizer(src: string) {
        const m = /^\$(?!\s)((?:\\\$|[^$\n])+?)(?<!\s)\$(?!\d)/.exec(src);
        return m ? { type: 'mathInline', raw: m[0], text: m[1]! } : undefined;
      },
      renderer: (token) => tex(token.text as string, false).value,
    },
  ],
});

/**
 * Renders Markdown (GFM) to HTML, with fenced code blocks syntax-highlighted.
 * Raw HTML is allowed: pages render with JavaScript disabled and no network
 * beyond images, so it can only affect layout.
 */
export async function renderMarkdown(source: string, mode: Mode): Promise<Html> {
  const tokens = marked.lexer(source);
  const jobs: Promise<void>[] = [];
  marked.walkTokens(tokens, (token: Token) => {
    if (token.type !== 'code') return;
    const code = token as Tokens.Code;
    const lang = (code.lang ?? '').split(/\s/)[0] ?? '';
    jobs.push(
      highlight(code.text, lang, { theme: defaultCodeTheme(mode) }).then((h) => {
        // Swap the code token for pre-rendered HTML.
        Object.assign(token, { type: 'html', block: true, pre: false, text: `<div class="md-code">${h.html}</div>`, raw: code.raw });
      }),
    );
  });
  await Promise.all(jobs);
  return raw(marked.parser(tokens));
}

/** Inline-only Markdown (bold, italics, code, links) for short text fields. */
export function renderInline(source: string): Html {
  return raw(marked.parseInline(source, { async: false }) as string);
}

/** A piece of a document on its own line: Markdown source, or a one-line placeholder for a table or code block. */
export type MarkdownBlock = { markdown: string } | { placeholder: string; icon: string };

/**
 * Splits a document into top-level blocks for a narrow, line-by-line layout
 * (a round screen): headings, paragraphs and quotes whole, lists one item
 * each, tables and code blocks as a placeholder ("table · 4 rows").
 */
export function markdownBlocks(source: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  for (const t of marked.lexer(source)) {
    if (t.type === 'space' || t.type === 'hr' || t.type === 'def') continue;
    if (t.type === 'list') {
      // Each item keeps its own marker (and number, so an ordered list counts on).
      // A table or code block inside an item (also one run on without a blank line) follows it as a placeholder.
      for (const item of (t as Tokens.List).items) {
        let md = item.raw;
        const nested: MarkdownBlock[] = [];
        for (const sub of item.tokens) {
          const ph = placeholder(sub);
          if (!ph) continue;
          nested.push(ph);
          const at = md.indexOf(sub.raw.split('\n')[0]!.trim());
          if (at > 0) md = md.slice(0, at);
        }
        blocks.push({ markdown: md.trimEnd() }, ...nested);
      }
    } else blocks.push(placeholder(t) ?? { markdown: t.raw.trim() });
  }
  return blocks;
}

function placeholder(t: Token): MarkdownBlock | null {
  if (t.type === 'table') {
    const n = (t as Tokens.Table).rows.length;
    return { placeholder: `table · ${n} row${n === 1 ? '' : 's'}`, icon: 'table' };
  }
  if (t.type === 'code') {
    const n = (t as Tokens.Code).text.split('\n').length;
    return { placeholder: `code · ${n} line${n === 1 ? '' : 's'}`, icon: 'code' };
  }
  return null;
}
