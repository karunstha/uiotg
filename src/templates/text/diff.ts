import { z } from 'zod';
import { diffLines, diffTokens, intraLine, parsePatch, type Op } from '../../core/diff.ts';
import { html, type Html } from '../../core/html.ts';
import { icon } from '../../core/icons.ts';
import { defineTemplate } from '../../core/types.ts';

type Row = { op: Op; mark?: Html | null } | { gap: number };

/** Keeps `context` unchanged lines around each change; longer unchanged runs collapse to a gap row. */
function withContext(ops: Op[], context: number): Row[] {
  const changed = ops.map((o) => o.type !== 'eq' || o.text === '\u0000hunk');
  const keep = ops.map((_, i) => {
    for (let k = Math.max(0, i - context); k <= Math.min(ops.length - 1, i + context); k++) if (changed[k]) return true;
    return false;
  });
  const rows: Row[] = [];
  let gap = 0;
  ops.forEach((op, i) => {
    if (op.text === '\u0000hunk') {
      rows.push({ gap: -1 });
      return;
    }
    if (keep[i]) {
      if (gap) rows.push({ gap });
      gap = 0;
      rows.push({ op });
    } else gap++;
  });
  if (gap) rows.push({ gap });
  return rows;
}

/** Marks the changed span inside paired deleted/added lines. */
function pairMarks(ops: Op[]): Map<Op, Html> {
  const marks = new Map<Op, Html>();
  for (let i = 0; i < ops.length; i++) {
    if (ops[i]!.type !== 'del') continue;
    let j = i;
    while (j < ops.length && ops[j]!.type === 'del') j++;
    let k = j;
    while (k < ops.length && ops[k]!.type === 'add') k++;
    const dels = ops.slice(i, j);
    const adds = ops.slice(j, k);
    for (let n = 0; n < Math.min(dels.length, adds.length); n++) {
      const split = intraLine(dels[n]!.text, adds[n]!.text);
      if (!split) continue;
      marks.set(dels[n]!, html`${split.prefix}<mark>${split.aMid}</mark>${split.suffix}`);
      marks.set(adds[n]!, html`${split.prefix}<mark>${split.bMid}</mark>${split.suffix}`);
    }
    i = k - 1;
  }
  return marks;
}

export const diff = defineTemplate({
  id: 'diff',
  title: 'Diff / changes',
  summary: 'before/after changes',
  category: 'text',
  description:
    'What changed between two versions: give `before` and `after` (code, config or prose) or a unified `patch`. Shows +/− lines with changed words highlighted and unchanged stretches collapsed; short prose renders as an inline word diff.',
  schema: z
    .object({
      title: z.string().max(160).optional().describe('Usually the file name'),
      subtitle: z.string().max(300).optional(),
      before: z.string().max(60_000).optional(),
      after: z.string().max(60_000).optional(),
      patch: z.string().max(120_000).optional().describe('Unified diff text, e.g. output of git diff'),
      view: z.enum(['auto', 'lines', 'words']).default('auto').describe('"words" shows an inline word diff (best for prose); auto picks it for short text'),
      context: z.number().int().min(0).max(20).default(3).describe('Unchanged lines kept around each change'),
    })
    .refine((d) => d.patch || (d.before != null && d.after != null), { message: 'Give before and after, or a patch' }),
  example: {
    title: 'src/config.ts',
    before: [
      "export const config = {",
      "  port: 8080,",
      "  host: '0.0.0.0',",
      "  timeoutMs: 15_000,",
      "  retries: 2,",
      "  logLevel: 'info',",
      "};",
    ].join('\n'),
    after: [
      "export const config = {",
      "  port: Number(process.env.PORT ?? 8080),",
      "  host: '0.0.0.0',",
      "  timeoutMs: 10_000,",
      "  retries: 2,",
      "  logLevel: 'info',",
      "  authToken: process.env.UIOTG_AUTH_TOKEN,",
      "};",
    ].join('\n'),
  },
  width: (d) => {
    const text = d.patch ?? `${d.before}\n${d.after}`;
    const longest = Math.max(...text.split('\n').map((l) => l.length));
    return Math.round(Math.min(1100, Math.max(560, longest * 8 + 160)));
  },
  background: 'plane',
  css: /* css */ `
.df{border:1px solid var(--border);border-radius:calc(12px * var(--rk));overflow:hidden;background:var(--surface)}
.df-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 14px;border-bottom:1px solid var(--grid);font-size:13px}
.df-file{display:flex;align-items:center;gap:7px;font-weight:600;color:var(--text);font-family:var(--font-mono)}
.df-file .icon{color:var(--muted)}
.df-stat{font-family:var(--font-mono);font-weight:600;display:flex;gap:10px}
.df-stat .p{color:var(--positive)}.df-stat .m{color:var(--negative)}
.df-sub{padding:8px 14px 0;font-size:13px;color:var(--text-2)}
.df-body{font-family:var(--font-mono);font-size:13px;line-height:1.6;padding:6px 0}
.df-row{display:grid;grid-template-columns:40px 40px 18px 1fr;padding-right:14px}
.df-n{color:var(--muted);text-align:right;padding-right:8px;font-variant-numeric:tabular-nums;opacity:.8}
.df-s{color:var(--muted);text-align:center}
.df-t{white-space:pre-wrap;word-break:break-word;color:var(--text)}
.df-row.del{background:color-mix(in srgb, var(--critical) 10%, transparent)}
.df-row.add{background:color-mix(in srgb, var(--good) 12%, transparent)}
.df-row.del .df-s{color:var(--negative)}.df-row.add .df-s{color:var(--positive)}
.df-row.del mark{background:color-mix(in srgb, var(--critical) 28%, transparent);color:inherit;border-radius:calc(3px * var(--rk))}
.df-row.add mark{background:color-mix(in srgb, var(--good) 32%, transparent);color:inherit;border-radius:calc(3px * var(--rk))}
.df-gap{padding:3px 14px 3px 98px;color:var(--muted);font-size:12px;background:var(--subtle);font-family:var(--font-sans)}
.df-words{padding:16px 18px;font-size:16px;line-height:1.7;color:var(--text);white-space:pre-wrap}
.df-words del{background:color-mix(in srgb, var(--critical) 16%, transparent);color:var(--negative);text-decoration:line-through;
  text-decoration-color:color-mix(in srgb, var(--critical) 60%, transparent);border-radius:calc(3px * var(--rk))}
.df-words ins{background:color-mix(in srgb, var(--good) 18%, transparent);color:var(--positive);text-decoration:none;border-radius:calc(3px * var(--rk))}
`,
  render(d) {
    const parsed = d.patch ? parsePatch(d.patch) : null;
    const before = d.before ?? '';
    const after = d.after ?? '';
    const prose = !parsed && before.split('\n').length <= 6 && after.split('\n').length <= 6 && !/[{};=<>]/.test(before + after);
    const words = d.view === 'words' || (d.view === 'auto' && prose && !parsed);
    const title = d.title ?? parsed?.file;

    if (words && !parsed) {
      const ops = diffTokens(before.split(/(\s+)/), after.split(/(\s+)/));
      const added = ops.filter((o) => o.type === 'add' && o.text.trim()).length;
      const removed = ops.filter((o) => o.type === 'del' && o.text.trim()).length;
      return html`<div class="df">
        ${head(title, added, removed, 'words')}
        ${d.subtitle ? html`<div class="df-sub">${d.subtitle}</div>` : null}
        <div class="df-words">${ops.map((o) => (o.type === 'eq' ? o.text : o.type === 'del' ? html`<del>${o.text}</del>` : html`<ins>${o.text}</ins>`))}</div>
      </div>`;
    }

    const ops = parsed?.ops ?? diffLines(before, after);
    const marks = pairMarks(ops);
    const added = ops.filter((o) => o.type === 'add').length;
    const removed = ops.filter((o) => o.type === 'del').length;
    const rows = withContext(ops, d.context);
    return html`<div class="df">
      ${head(title, added, removed, 'lines')}
      ${d.subtitle ? html`<div class="df-sub">${d.subtitle}</div>` : null}
      <div class="df-body">${rows.map((r) => {
        if ('gap' in r) return html`<div class="df-gap">${r.gap < 0 ? '⋯' : `⋯ ${r.gap} unchanged line${r.gap === 1 ? '' : 's'}`}</div>`;
        const o = r.op;
        const sign = o.type === 'add' ? '+' : o.type === 'del' ? '−' : '';
        return html`<div class="${`df-row ${o.type}`}"><span class="df-n">${o.a ?? ''}</span><span class="df-n">${o.b ?? ''}</span><span class="df-s">${sign}</span><span class="df-t">${marks.get(o) ?? (o.text || ' ')}</span></div>`;
      })}</div>
    </div>`;
  },
});

function head(title: string | undefined, added: number, removed: number, unit: 'lines' | 'words'): Html {
  return html`<div class="df-head">
    <span class="df-file">${icon(unit === 'words' ? 'file-text' : 'file-diff', { size: 15 })}${title ?? (unit === 'words' ? 'Changes' : 'Diff')}</span>
    <span class="df-stat"><span class="p">+${added}</span><span class="m">−${removed}</span>${unit === 'words' ? html`<span style="color:var(--muted);font-weight:500">words</span>` : null}</span>
  </div>`;
}
