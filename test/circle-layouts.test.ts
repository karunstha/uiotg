import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, test } from 'node:test';
import { z } from 'zod';
import { createRenderer, defaultRegistry, html, ThemeStore } from '../src/index.ts';
import { defineTemplate, type RenderContext } from '../src/core/types.ts';
import { inkOutsideCircle } from './ink.ts';

// Reports the context each layout gets; used by these tests only.
const seen: Record<string, RenderContext['circle'] | null> = {};
const probe = defineTemplate({
  id: 'round_probe',
  title: 'Round probe',
  category: 'basic',
  summary: 'test probe',
  description: 'Reports which layout ran and the circle it got; used by the circle layout tests only.',
  schema: z.object({}),
  example: {},
  width: 400,
  render: (_d, ctx) => {
    seen.render = ctx.circle ?? null;
    return html`<div>rect</div>`;
  },
  renderCircle: (_d, ctx) => {
    seen.renderCircle = ctx.circle;
    return html`<div>round</div>`;
  },
});

const store = new ThemeStore(mkdtempSync(join(tmpdir(), 'uiotg-themes-')));
const renderer = createRenderer({ registry: defaultRegistry().register(probe), themes: store });
after(() => renderer.close());

const ROUND = { width: 466, height: 466, scale: 1, overflow: 'cap', shape: 'circle', theme: 'dark' } as const;
const example = (id: string) => renderer.registry.get(id)!.example;
const tile = (label: string, value: number) => ({ label, value, delta: 4.2, delta_label: 'vs last week' });
const rings = (n: number) =>
  [
    { label: 'Move', value: 520, goal: 600, unit: 'kcal' },
    { label: 'Exercise', value: 42, goal: 30, unit: 'min' },
    { label: 'Stand', value: 9, goal: 12, unit: 'h' },
    { label: 'Steps', value: 8200, goal: 10000 },
  ].slice(0, n);

const CASES: Array<[string, string, unknown]> = [
  ['gauge', 'example', example('gauge')],
  ['gauge', 'no title, thresholds', { value: 42, thresholds: [{ from: 0, status: 'good' }, { from: 80, status: 'critical', label: 'Hot' }] }],
  ['gauge', 'plain', { value: 3.2, max: 5, label: 'Load' }],
  ['activity', 'example', example('activity')],
  ['activity', '1 ring', { rings: rings(1) }],
  ['activity', '4 rings', { title: 'Today', rings: rings(4), metrics: [{ label: 'Sleep', value: '7h 12m' }] }],
  ['weather', 'example', example('weather')],
  ['weather', 'current only', { location: 'Lisbon', current: { temperature: 23, condition: 'rain' } }],
  ['stats', 'example', example('stats')],
  ['stats', '1 tile', { items: [tile('Revenue', 4210)] }],
  ['stats', '6 tiles', { title: 'Ops', items: Array.from({ length: 6 }, (_, i) => tile(`Metric ${i + 1}`, 1000 * (i + 1))) }],
];

describe('round layouts (Template.renderCircle)', () => {
  test('renderCircle runs with shape circle and gets the circle; render gets none on a rectangle', async () => {
    await renderer.toHtml('round_probe', {}, ROUND);
    assert.deepEqual(seen.renderCircle, { diameter: 466, safe: 450 });
    seen.render = undefined;
    const rect = await renderer.toHtml('round_probe', {}, { width: 466, height: 466 });
    assert.equal(seen.render, null);
    assert.doesNotMatch(rect.html, /circle-own/);
    // Templates without one keep their own render on a circle, now told about it.
    const round = await renderer.toHtml('round_probe', {}, { ...ROUND, padding: 12 });
    assert.match(round.html, /shape-circle circle-rows circle-own/);
    assert.deepEqual(seen.renderCircle, { diameter: 466, safe: 426 });
  });

  for (const [id, name, data] of CASES) {
    test(`${id} (${name}): fills the circle without growing, much shrinking or ink outside it`, async () => {
      const res = await renderer.render(id, data, ROUND);
      assert.deepEqual([res.width, res.height, res.adjusted], [466, 466, undefined]);
      assert.ok(res.scaled == null || res.scaled >= 0.85, `scaled ${res.scaled}`);
      assert.equal(await inkOutsideCircle(renderer, res.data, 466, 466, 233), 0);
    });
  }

  test('weather with only current conditions keeps to the essentials', async () => {
    const doc = await renderer.toHtml('weather', CASES[7]![2], ROUND);
    assert.match(doc.html, /Lisbon/);
    assert.match(doc.html, /23°/);
    assert.doesNotMatch(doc.html, /class="wx-r(hours|facts|day)/);
  });

  test('stats: six tiles show as many as fit and a "+N more" row; a rectangle is untouched', async () => {
    const data = CASES[10]![2];
    const res = await renderer.render('stats', data, ROUND);
    assert.ok(res.capped && res.capped.total === 6 && res.capped.shown < 6 && res.capped.shown >= 3, JSON.stringify(res.capped));
    // truncateCircle is for the round layout only: the rectangle still shrinks instead.
    const rect = await renderer.render('stats', { items: Array.from({ length: 9 }, (_, i) => tile(`Metric ${i}`, i)) }, { ...ROUND, shape: 'rect' });
    assert.equal(rect.capped, undefined);
  });

  test('activity draws every ring and its legend line', async () => {
    const doc = await renderer.toHtml('activity', CASES[5]![2], ROUND);
    assert.equal(doc.html.match(/class="at-rl /g)?.length, 4);
    assert.equal(doc.html.match(/<circle /g)!.length >= 8, true);
  });

  test('gauge without a title still shows the value, status and range', async () => {
    const doc = await renderer.toHtml('gauge', CASES[1]![2], ROUND);
    assert.doesNotMatch(doc.html, /class="gg-rt"/);
    assert.match(doc.html, /class="status"/);
    assert.match(doc.html, />Healthy<|>Good</);
  });

  for (const id of ['gauge', 'activity', 'weather', 'stats']) {
    test(`${id}: a rectangle uses the usual layout and none of the round CSS`, async () => {
      const opts = { width: 466, height: 466, scale: 1, overflow: 'cap', theme: 'dark' } as const;
      const plain = await renderer.toHtml(id, example(id), opts);
      assert.equal((await renderer.toHtml(id, example(id), { ...opts, shape: 'rect' })).html, plain.html);
      assert.doesNotMatch(plain.html, /circle-own|gg-round|at-rings|wx-rhead|st-rhead/);
    });
  }
});
