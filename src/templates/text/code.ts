import { z } from 'zod';
import { CODE_THEMES, defaultCodeTheme, highlight } from '../../core/highlight.ts';
import { html, raw, style } from '../../core/html.ts';
import { defineTemplate } from '../../core/types.ts';

export const code = defineTemplate({
  id: 'code',
  title: 'Code snippet',
  summary: 'code snippet with highlighting',
  category: 'text',
  description:
    'A syntax-highlighted code snippet in an editor window, with line numbers and highlighted lines. Supports every common language (ts, python, rust, go, sql, bash, diff, json, …).',
  schema: z.object({
    code: z.string().min(1).max(20_000),
    language: z.string().max(40).default('text').describe('Language id, e.g. "ts", "python", "sql", "diff"'),
    title: z.string().max(120).optional().describe('Window title, usually a file name'),
    line_numbers: z.boolean().default(true),
    start_line: z.number().int().min(1).default(1).describe('Number of the first line'),
    highlight_lines: z.array(z.number().int().min(1)).max(500).optional().describe('Line numbers to emphasize'),
    code_theme: z.enum(CODE_THEMES).optional().describe('Syntax theme; defaults to GitHub light/dark to match the image theme'),
    font_size: z.number().int().min(10).max(24).default(14),
  }),
  example: {
    title: 'retry.ts',
    language: 'ts',
    highlight_lines: [6, 7],
    code: [
      'export async function retry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {',
      '  let lastError: unknown;',
      '  for (let i = 0; i < attempts; i++) {',
      '    try {',
      '      return await fn();',
      '    } catch (err) {',
      '      lastError = err;',
      '      await sleep(2 ** i * 100);',
      '    }',
      '  }',
      '  throw lastError;',
      '}',
    ].join('\n'),
  },
  width: (d) => {
    const longest = Math.max(...d.code.split('\n').map((l) => l.replace(/\t/g, '  ').length));
    const charW = d.font_size * 0.6;
    return Math.round(Math.min(1100, Math.max(520, longest * charW + (d.line_numbers ? 56 : 0) + 112)));
  },
  background: 'plane',
  css: /* css */ `
.cw{border-radius:calc(12px * var(--rk));overflow:hidden;border:1px solid var(--border);
  box-shadow:0 1px 2px rgba(0,0,0,.06),0 12px 32px -8px rgba(0,0,0,.18)}
.cw-bar{display:flex;align-items:center;gap:8px;height:40px;padding:0 14px;position:relative}
.cw-dot{width:12px;height:12px;border-radius:50%}
.cw-title{position:absolute;left:0;right:0;text-align:center;font-size:13px;font-weight:500;opacity:.7;pointer-events:none}
.cw pre.shiki{margin:0;padding:6px 0 18px;font-family:var(--font-mono);white-space:pre-wrap;word-break:break-word;
  tab-size:2;line-height:1.6}
.cw .line{position:relative;padding:0 20px}
.cw.ln .line{padding-left:60px}
.cw.ln .line::before{content:attr(data-line);position:absolute;left:0;width:40px;text-align:right;opacity:.38;
  font-variant-numeric:tabular-nums}
.cw .line.hl{background:color-mix(in srgb, var(--accent) 16%, transparent);box-shadow:inset 3px 0 0 var(--accent)}
`,
  async render(d, ctx) {
    const theme = d.code_theme ?? defaultCodeTheme(ctx.theme.mode);
    const out = await highlight(d.code, d.language, {
      theme,
      startLine: d.start_line,
      highlightLines: new Set(d.highlight_lines ?? []),
    });
    return html`<div class="${`cw${d.line_numbers ? ' ln' : ''}`}" style="${style({ background: out.background, color: out.foreground })}">
      <div class="cw-bar">
        <span class="cw-dot" style="background:#ff5f57"></span>
        <span class="cw-dot" style="background:#febc2e"></span>
        <span class="cw-dot" style="background:#28c840"></span>
        ${d.title ? html`<span class="cw-title">${d.title}</span>` : null}
      </div>
      <div style="${`font-size:${d.font_size}px`}">${raw(out.html)}</div>
    </div>`;
  },
});
