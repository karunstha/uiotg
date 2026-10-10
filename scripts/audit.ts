// Renders every template's example and a stressed variant (long text, big
// numbers) at its default width and a narrow width, and reports overflow.
// Run: node scripts/audit.ts [template,template…]
import { createRenderer } from '../src/index.ts';
import { stressData } from '../src/stress.ts';

const only = process.argv[2]?.split(',');
const renderer = createRenderer({ browser: { allowNetwork: false } });
let total = 0;
const summary: string[] = [];
for (const t of renderer.registry.list().filter((t) => !only || only.includes(t.id))) {
  const cases: Array<[string, unknown, { width?: number }]> = [
    ['example', t.example, {}],
    ['stress', stressData(t, renderer.registry), {}],
    ['stress@480', stressData(t, renderer.registry), { width: 480 }],
  ];
  for (const [name, data, opts] of cases) {
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
