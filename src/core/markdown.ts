import { Marked, type Token, type Tokens } from 'marked';
import { raw, type Html } from './html.ts';
import { defaultCodeTheme, highlight } from './highlight.ts';
import type { Mode } from './theme.ts';

const marked = new Marked({ gfm: true, breaks: false });

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
