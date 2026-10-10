import { z } from 'zod';
import { iconSchema, titleFields } from '../../core/format.ts';
import { defaultCodeTheme, highlight } from '../../core/highlight.ts';
import { html, raw, style } from '../../core/html.ts';
import { icon } from '../../core/icons.ts';
import { renderInline } from '../../core/markdown.ts';
import { defineTemplate } from '../../core/types.ts';
import { header } from '../../core/ui.ts';

export const steps = defineTemplate({
  id: 'steps',
  title: 'Steps / how-to',
  category: 'text',
  description:
    'Numbered step-by-step instructions with an optional code snippet and tip per step, and done/current/upcoming progress. Use for setup guides, recipes, troubleshooting and onboarding.',
  schema: z.object({
    ...titleFields,
    steps: z
      .array(
        z.object({
          title: z.string().min(1).max(160),
          description: z.string().max(800).optional().describe('Inline Markdown supported'),
          code: z.string().max(4000).optional().describe('A command or snippet for this step'),
          language: z.string().max(40).default('bash'),
          tip: z.string().max(300).optional().describe('Highlighted hint or warning'),
          status: z.enum(['done', 'current', 'upcoming']).optional(),
          icon: iconSchema.optional().describe('Replaces the step number'),
        }),
      )
      .min(1)
      .max(20),
  }),
  example: {
    title: 'Deploy uiotg with Docker',
    subtitle: 'About 5 minutes on any Linux server',
    steps: [
      { title: 'Clone the repository', code: 'git clone https://github.com/you/uiotg && cd uiotg', status: 'done' },
      { title: 'Create your environment file', description: 'Copy the example and set a long random token.', code: 'cp .env.example .env\necho "UIOTG_AUTH_TOKEN=$(openssl rand -hex 32)" >> .env', status: 'done' },
      { title: 'Start the container', code: 'docker compose up -d --build', tip: 'The first build downloads Chromium (~150 MB).', status: 'current' },
      { title: 'Connect your agent', description: 'Point your MCP client at `https://your-host/mcp` with the bearer token.', status: 'upcoming' },
    ],
  },
  width: 720,
  css: /* css */ `
.stp-list{display:flex;flex-direction:column}
.stp-step{display:grid;grid-template-columns:32px 1fr;column-gap:16px}
.stp-rail{display:flex;flex-direction:column;align-items:center}
.stp-num{width:30px;height:30px;border-radius:50%;flex:none;display:flex;align-items:center;justify-content:center;font-size:13px;
  font-weight:700;background:var(--subtle);color:var(--text-2);font-variant-numeric:tabular-nums}
.stp-step.stp-done .stp-num{background:var(--accent);color:#fff}
.stp-step.stp-current .stp-num{background:var(--surface);color:var(--accent);box-shadow:inset 0 0 0 2px var(--accent),0 0 0 4px color-mix(in srgb, var(--accent) 18%, transparent)}
.stp-line{flex:1;width:2px;background:var(--grid);margin:4px 0}
.stp-step:last-child .stp-line{display:none}
.stp-body{padding:4px 0 24px;min-width:0}
.stp-step:last-child .stp-body{padding-bottom:0}
.stp-title{font-size:16px;font-weight:620;color:var(--text);line-height:22px}
.stp-step.stp-upcoming .stp-title{color:var(--text-2)}
.stp-desc{font-size:14px;line-height:1.5;color:var(--text-2);margin-top:4px}
.stp-desc code{font-family:var(--font-mono);font-size:.88em;background:var(--subtle);padding:.1em .35em;border-radius:4px}
.stp-code{margin-top:10px;border-radius:10px;overflow:hidden;border:1px solid var(--border)}
.stp-code pre.shiki{margin:0;padding:10px 14px;font-family:var(--font-mono);font-size:13px;line-height:1.55;white-space:pre-wrap;overflow-wrap:anywhere}
.stp-tip{display:flex;gap:8px;align-items:flex-start;margin-top:10px;padding:8px 12px;border-radius:8px;font-size:13px;line-height:1.45;
  background:color-mix(in srgb, var(--warning) 12%, var(--surface));color:var(--text)}
.stp-tip .icon{color:var(--warning);margin-top:1px}
`,
  async render(d, ctx) {
    const theme = defaultCodeTheme(ctx.theme.mode);
    const blocks = await Promise.all(d.steps.map((s) => (s.code ? highlight(s.code, s.language, { theme }) : null)));
    return html`${header(d)}<div class="stp-list">${d.steps.map((s, i) => {
      const code = blocks[i];
      const mark = s.icon ? icon(s.icon, { size: 15 }) : s.status === 'done' ? icon('check', { size: 15, strokeWidth: 3 }) : i + 1;
      return html`<div class="${`stp-step${s.status ? ` stp-${s.status}` : ''}`}">
        <div class="stp-rail"><span class="stp-num">${mark}</span><span class="stp-line"></span></div>
        <div class="stp-body">
          <div class="stp-title">${s.title}</div>
          ${s.description ? html`<div class="stp-desc">${renderInline(s.description)}</div>` : null}
          ${code ? html`<div class="stp-code" style="${style({ background: code.background })}">${raw(code.html)}</div>` : null}
          ${s.tip ? html`<div class="stp-tip">${icon('lightbulb', { size: 15 })}<span>${s.tip}</span></div>` : null}
        </div>
      </div>`;
    })}</div>`;
  },
});
