// Renders every template's example and a stressed variant (long text, big
// numbers) at its default width and a narrow width, and reports overflow.
// Run: node scripts/audit.ts [template,template…] [--fonts]
// --fonts repeats every case in the serif, mono and rounded theme fonts, which set text wider than Inter.
import { createRenderer, type RenderOptions } from '../src/index.ts';
import { stressData } from '../src/stress.ts';

const args = process.argv.slice(2);
const only = args.find((a) => !a.startsWith('--'))?.split(',');
const themes: Array<[string, RenderOptions['theme']]> = args.includes('--fonts')
  ? [['default', 'light'], ['serif', 'paper'], ['mono', 'terminal'], ['rounded', { font: 'rounded', corners: 'round' }]]
  : [['', undefined]];
const renderer = createRenderer({ browser: { allowNetwork: false } });
let total = 0;
const summary: string[] = [];
for (const t of renderer.registry.list().filter((t) => !only || only.includes(t.id))) {
  const cases: Array<[string, unknown, { width?: number }]> = [
    ['example', t.example, {}],
    ['stress', stressData(t, renderer.registry), {}],
    ['stress@480', stressData(t, renderer.registry), { width: 480 }],
  ];
  for (const [name, data, opts] of cases.flatMap(([n, d, o]) => themes.map(([tn, theme]) => [tn ? `${n} ${tn}` : n, d, { ...o, theme }] as const))) {
    const issues = await renderer.audit(t.id, data, opts).catch((e: Error) => [{ problem: 'error', element: '', text: e.message.split('\n')[0] }]);
    total += issues.length;
    if (issues.length) summary.push(`${t.id} [${name}]: ${issues.length}`);
    if (!process.env.QUIET) for (const i of issues.slice(0, 6)) console.log(`${t.id} [${name}] ${i.problem} ${i.element}: ${i.text}`);
    if (!process.env.QUIET && issues.length > 6) console.log(`${t.id} [${name}] … ${issues.length - 6} more`);
  }
}
console.log(`\n${summary.join('\n')}\n${total} overflow issue(s)`);
await renderer.close();
process.exit(total ? 1 : 0);
