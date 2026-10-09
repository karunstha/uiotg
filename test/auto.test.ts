import assert from 'node:assert/strict';
import { after, describe, test } from 'node:test';
import { chooseVisual, createRenderer, type VisualizeInput } from '../src/index.ts';

const renderer = createRenderer({ browser: { allowNetwork: false } });
after(() => renderer.close());
const choose = (input: VisualizeInput) => chooseVisual(input, renderer.registry);

describe('visualize: choosing a template', () => {
  const cases: Array<[string, VisualizeInput, string]> = [
    ['a number', { data: 42, title: 'Open tickets' }, 'stats'],
    ['numeric text', { data: '$4.2M' }, 'stats'],
    ['two numbers → value with change', { data: [120, 150] }, 'stats'],
    ['a long number sequence', { data: [3, 5, 4, 6, 8, 7, 9, 12, 11, 14] }, 'line_chart'],
    ['short text', { data: 'Deploy finished in 4m 12s.' }, 'text_card'],
    ['structured text', { data: '# Notes\n- one\n- two' }, 'markdown'],
    ['short labels', { data: ['rust', 'go', 'zig', 'ts', 'python', 'elixir'] }, 'tags'],
    ['sentences', { data: ['Ship SSO', 'Fix the billing bug before Friday'] }, 'list'],
    ['a few named numbers', { data: { revenue: 4_200_000, users: 1280, churn: 0.021 } }, 'stats'],
    ['many named numbers', { data: { a: 5, b: 9, c: 3, d: 7, e: 1, f: 4 } }, 'bar_chart'],
    ['shares adding to 100', { data: { Chrome: 64, Safari: 19, Edge: 5, Firefox: 3, Other: 9 } }, 'pie_chart'],
    ['a mixed record', { data: { name: 'Ada', role: 'Engineer', active: true } }, 'key_value'],
    ['a single row', { data: [{ id: 7, status: 'paid', total: 120 }] }, 'key_value'],
    [
      'a time series',
      { data: [{ date: '2026-01-01', signups: 120 }, { date: '2026-02-01', signups: 140 }, { date: '2026-03-01', signups: 180 }] },
      'line_chart',
    ],
    [
      'ranked categories',
      { data: [{ team: 'Web', bugs: 12 }, { team: 'API', bugs: 30 }, { team: 'iOS', bugs: 8 }, { team: 'Data', bugs: 5 }, { team: 'Infra', bugs: 17 }] },
      'bar_chart',
    ],
    [
      'two measures',
      { data: Array.from({ length: 20 }, (_, i) => ({ price: 10 + i * 5, rating: 3 + (i % 5) * 0.4 })) },
      'scatter_chart',
    ],
    [
      'wide mixed rows',
      { data: [{ id: 1, name: 'A', owner: 'x', region: 'EU', mrr: 10, seats: 3 }, { id: 2, name: 'B', owner: 'y', region: 'US', mrr: 20, seats: 9 }] },
      'table',
    ],
    ['data already shaped for a chart', { data: { categories: ['a', 'b'], series: [{ name: 's', values: [1, 2] }] } }, 'bar_chart'],
    ['rows with coordinates', { data: [{ name: 'HQ', lat: 51.52, lon: -0.08 }, { name: 'Store', lat: 51.51, lon: -0.12 }] }, 'map'],
    ['before and after', { data: { before: 'a\nb\nc', after: 'a\nB\nc' } }, 'diff'],
    ['a git patch', { data: { patch: '--- a/x.ts\n+++ b/x.ts\n@@ -1,2 +1,2 @@\n-const a = 1;\n+const a = 2;\n export {};' } }, 'diff'],
  ];
  for (const [name, input, expected] of cases) {
    test(name, async () => {
      const choice = choose(input);
      assert.equal(choice.template, expected, choice.reason);
      // Whatever it picks must be valid for that template.
      await renderer.toHtml(choice.template, choice.data);
    });
  }

  test('pivots long-format rows into one series per group', () => {
    const rows = ['2026-01', '2026-02', '2026-03'].flatMap((m, i) => [
      { month: m, region: 'EU', revenue: 100 + i * 10 },
      { month: m, region: 'US', revenue: 200 + i * 15 },
    ]);
    const choice = choose({ data: rows });
    assert.equal(choice.template, 'line_chart');
    assert.deepEqual((choice.data.series as Array<{ name: string }>).map((s) => s.name), ['EU', 'US']);
  });

  test('splits measures on different scales instead of sharing an axis', () => {
    const rows = ['2026-01-01', '2026-01-02', '2026-01-03'].map((d, i) => ({ date: d, users: 30_000 + i * 900, sessions: 3 + i }));
    assert.equal(choose({ data: rows }).template, 'dashboard');
  });

  test('infers formats from names and values', () => {
    const choice = choose({ data: [{ month: '2026-01', revenue: 52_000 }, { month: '2026-02', revenue: 61_000 }, { month: '2026-03', revenue: 70_000 }] });
    assert.equal(choice.data.format, 'currency_compact');
    assert.deepEqual(choice.data.x, ['Jan', 'Feb', 'Mar']);
  });

  test('uses the title once', () => {
    const choice = choose({ data: 42, title: 'Open tickets' });
    assert.equal(choice.data.title, undefined);
    assert.equal((choice.data.items as Array<{ label: string }>)[0]!.label, 'Open tickets');
  });

  test('rejects empty data', () => {
    assert.throws(() => choose({ data: [] }), /Nothing to visualize/);
  });
});

describe('detail levels', () => {
  const line = renderer.registry.get('line_chart')!.example;
  test('auto is rich with room and enough data, minimal when small', async () => {
    assert.equal((await renderer.toHtml('line_chart', line)).detail, 'rich');
    assert.equal((await renderer.toHtml('line_chart', line, { width: 380 })).detail, 'minimal');
    assert.equal((await renderer.toHtml('line_chart', { x: ['a', 'b', 'c'], series: [{ name: 's', values: [1, 2, 3] }] })).detail, 'standard');
  });
  test('rich adds a summary strip; minimal drops the subtitle', async () => {
    assert.match((await renderer.toHtml('line_chart', line, { detail: 'rich' })).html, /class="sum"/);
    assert.doesNotMatch((await renderer.toHtml('line_chart', line, { detail: 'minimal' })).html, /class="hdr-sub"/);
  });
});
