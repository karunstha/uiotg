import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, test } from 'node:test';
import { chooseVisual, createRenderer, screenFrom, ThemeStore, type VisualizeInput } from '../src/index.ts';

const themes = new ThemeStore(mkdtempSync(join(tmpdir(), 'uiotg-themes-')));
themes.save('round', { base: 'dark', defaults: { width: 466, height: 466, shape: 'circle', overflow: 'cap' } });
const renderer = createRenderer({ browser: { allowNetwork: false }, themes });
after(() => renderer.close());

/** The screen a render with `theme` would use, resolved like the renderer does. */
const screenFor = (theme?: string) => {
  const o = renderer.effectiveOptions(theme ? { theme } : {});
  return screenFrom({ width: o.width, height: o.height, shape: o.shape });
};
const round = screenFor('round');
const plain = screenFor();
const choose = (input: VisualizeInput) => chooseVisual(input, renderer.registry);
const valid = (template: string, data: unknown) => {
  const r = renderer.registry.get(template)!.schema.safeParse(data);
  assert.ok(r.success, `${template}: ${JSON.stringify(r.error?.issues ?? [])}`);
};

const wide = Array.from({ length: 5 }, (_, i) => ({ id: i + 1, name: `Account ${i + 1}`, owner: 'x', region: 'EU', mrr: 10 * (i + 1), seats: i + 2 }));
const scales = Array.from({ length: 6 }, (_, i) => ({ date: `2026-0${i + 1}-01`, revenue: 100_000 + i * 5000, conversion: 0.02 + i * 0.001 }));

describe('visualize: screen from the used theme', () => {
  test('the theme defaults make a small round screen; no theme is not small', () => {
    assert.deepEqual(round, { shape: 'circle', width: 466, height: 466, small: true });
    assert.equal(plain.small, false);
    assert.equal(screenFrom({ width: 368, height: 448 }).small, true);
    assert.equal(screenFrom({ width: 800 }).small, false);
  });

  test('a wide table becomes label/value rows on a small screen', () => {
    const choice = choose({ data: wide, screen: round });
    assert.notEqual(choice.template, 'table');
    assert.equal(choice.template, 'key_value');
    assert.match(choice.reason, /6 columns are too wide/);
    valid(choice.template, choice.data);
  });

  test('a wide table without a label keeps three columns and says so', () => {
    const rows = Array.from({ length: 4 }, (_, i) => ({ name: `N${i}`, owner: 'ann', region: 'EU', team: 'web', state: 'ok' }));
    const choice = choose({ data: rows, screen: round });
    assert.equal(choice.template, 'table');
    assert.equal((choice.data.columns as unknown[]).length, 3);
    assert.match(choice.reason, /kept 3 of 5 columns \(Name, Owner, Region\)/);
    valid(choice.template, choice.data);
  });

  test('a dashboard degrades to one summary block on a small screen', () => {
    assert.equal(choose({ data: scales }).template, 'dashboard');
    const choice = choose({ data: scales, screen: round });
    assert.equal(choice.template, 'stats');
    assert.equal((choice.data.items as unknown[]).length, 2);
    valid(choice.template, choice.data);
    const blocks = { blocks: [{ template: 'stats', data: { items: [{ label: 'A', value: 1 }] } }, { template: 'text_card', data: { text: 'hi' } }] };
    const first = choose({ data: blocks, screen: round });
    assert.equal(first.template, 'stats');
    assert.match(first.reason, /first block/);
  });

  test('the same inputs without the theme are unchanged', () => {
    for (const data of [wide, scales]) assert.deepEqual(choose({ data, screen: plain }), choose({ data }));
  });
});
