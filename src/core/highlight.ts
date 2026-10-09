import { bundledLanguages, bundledThemes, createHighlighter, type BundledLanguage, type BundledTheme, type Highlighter } from 'shiki';
import type { Mode } from './theme.ts';

export const CODE_THEMES = [
  'github-light',
  'github-dark',
  'github-dark-dimmed',
  'one-light',
  'one-dark-pro',
  'vitesse-light',
  'vitesse-dark',
  'catppuccin-latte',
  'catppuccin-mocha',
  'rose-pine-dawn',
  'rose-pine',
  'tokyo-night',
  'nord',
  'dracula',
  'min-light',
  'min-dark',
  'solarized-light',
  'solarized-dark',
] as const satisfies readonly BundledTheme[];

export type CodeTheme = (typeof CODE_THEMES)[number];

export function defaultCodeTheme(mode: Mode): CodeTheme {
  return mode === 'dark' ? 'github-dark' : 'github-light';
}

let highlighter: Promise<Highlighter> | undefined;

function getHighlighter(): Promise<Highlighter> {
  highlighter ??= createHighlighter({ themes: [], langs: [] });
  return highlighter;
}

const PLAIN = new Set(['text', 'txt', 'plain', 'plaintext', '']);

export interface Highlighted {
  /** `<pre class="shiki">…</pre>` with one `.line` span per line. */
  html: string;
  background: string;
  foreground: string;
  language: string;
}

export interface HighlightOptions {
  theme: CodeTheme;
  startLine?: number;
  highlightLines?: ReadonlySet<number>;
}

export async function highlight(code: string, language: string, opts: HighlightOptions): Promise<Highlighted> {
  const hl = await getHighlighter();
  let lang = language.trim().toLowerCase();
  if (PLAIN.has(lang) || !(lang in bundledLanguages)) lang = 'text';
  else if (!hl.getLoadedLanguages().includes(lang)) await hl.loadLanguage(lang as BundledLanguage);
  const theme = opts.theme in bundledThemes ? opts.theme : 'github-light';
  if (!hl.getLoadedThemes().includes(theme)) await hl.loadTheme(theme);
  const start = opts.startLine ?? 1;
  const marked = opts.highlightLines;
  const out = hl.codeToHtml(code.replace(/\s+$/, ''), {
    lang,
    theme,
    transformers: [
      {
        line(node, line) {
          const n = line + start - 1;
          node.properties['data-line'] = String(n);
          if (marked?.has(n)) this.addClassToHast(node, 'hl');
        },
      },
    ],
  });
  const t = hl.getTheme(theme);
  return {
    // Lines are display:block in our CSS, so the newlines between them would add blank rows.
    html: out.replace(/<\/span>\n<span class="line/g, '</span><span class="line'),
    background: t.bg,
    foreground: t.fg,
    language: lang,
  };
}
