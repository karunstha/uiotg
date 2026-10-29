import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, test } from 'node:test';
import { z } from 'zod';
import { buildTheme, createRenderer, defaultRegistry, html, PRESETS, ThemeStore } from '../src/index.ts';
import { defineTemplate, type RenderContext, type Template } from '../src/core/types.ts';
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

// Stage B: everyday templates. Each has an example, a smaller case and (where it has items to cut) a long one.
const zones = ['America/Los_Angeles', 'America/New_York', 'Europe/London', 'Europe/Berlin', 'Asia/Kolkata', 'Asia/Tokyo', 'Australia/Sydney', 'Asia/Dubai', 'America/Chicago', 'Europe/Paris'];
const MORE: Array<[string, string, unknown]> = [
  ['progress', 'small', { items: [{ label: 'Reading', value: 12, max: 20, target: 15 }, { label: 'Savings', value: 840, max: 1000, format: { prefix: '$' }, status: 'good' }] }],
  ['status_page', 'small', { services: [{ name: 'API', status: 'operational', uptime: 99.99 }, { name: 'Database', status: 'partial_outage' }] }],
  ['world_clock', 'small', { at: '2026-10-09T14:30:00Z', cities: [{ name: 'Chicago', timezone: 'America/Chicago' }, { name: 'Kathmandu', timezone: 'Asia/Kathmandu' }] }],
  ['alarm', 'small', { timezone: 'Europe/London', now: '2026-10-09T22:48:00Z', alarms: [{ time: '06:45', label: 'Gym', repeat: 'weekdays', sound: 'Radar' }] }],
  ['sports_score', 'small', { league: 'NBA', status: 'final', home: { name: 'Lakers', short: 'LAL', score: 112 }, away: { name: 'Celtics', short: 'BOS', score: 108 } }],
  ['task_board', 'small', { columns: [{ name: 'To do', cards: [{ title: 'Buy milk' }, { title: 'Call the bank', priority: 'high' }] }, { name: 'Done', cards: [{ title: 'Laundry' }] }] }],
  ['pie_chart', 'small', { slices: [{ label: 'Rent', value: 1200 }, { label: 'Food', value: 450 }, { label: 'Fun', value: 200 }], format: { prefix: '$' } }],
  ['table', 'small', { columns: ['name', 'score'], rows: [{ name: 'Ada', score: 92 }, { name: 'Lin', score: 87 }, { name: 'Sam', score: 75 }] }],
  ['markdown', 'small', { markdown: '## Groceries\nFor the weekend.\n- Eggs\n- Bread\n- Coffee' }],
  ['stock_quote', 'small', { symbol: 'BTC', currency: 'USD', price: 81340, change_percent: -2.41 }],
  ['profile_card', 'small', { name: 'Sam Lee', handle: '@sam', tags: ['Go', 'Kubernetes'] }],
  ['progress', 'long', { title: 'Sprint 42', items: Array.from({ length: 12 }, (_, i) => ({ label: `Goal number ${i + 1}`, value: 10 + i * 7, caption: 'A caption' })) }],
  ['status_page', 'long', { title: 'Platform', updated: 'Updated just now', services: Array.from({ length: 14 }, (_, i) => ({ name: `Service ${i + 1}`, status: i === 3 ? 'degraded' : 'operational', uptime: 99.9, history: Array.from({ length: 30 }, () => 100) })) }],
  ['world_clock', 'long', { title: 'Offices', at: '2026-10-09T14:30:00Z', cities: zones.map((z) => ({ name: z.split('/')[1]!.replace('_', ' '), timezone: z })) }],
  ['alarm', 'long', { title: 'Alarms', timezone: 'UTC', now: '2026-10-09T22:48:00Z', alarms: Array.from({ length: 9 }, (_, i) => ({ time: `0${i}:30`, label: `Alarm ${i + 1}`, repeat: 'daily', enabled: i % 3 !== 0 })) }],
  ['task_board', 'long', { title: 'Backlog', columns: ['To do', 'In progress', 'Review', 'Done'].map((name, j) => ({ name, cards: Array.from({ length: 6 }, (_, i) => ({ title: `Task ${j + 1}.${i + 1} with a longer title`, assignee: 'Lena Park', priority: 'medium' })) })) }],
  ['table', 'long', { title: 'Inventory', rows: Array.from({ length: 30 }, (_, i) => ({ item: `Item ${i + 1}`, stock: i * 3, price: 9.5 + i, supplier: 'Acme', region: 'EU' })) }],
];
const STAGE_B = ['progress', 'status_page', 'world_clock', 'alarm', 'sports_score', 'task_board', 'pie_chart', 'table', 'markdown', 'stock_quote', 'profile_card'];
CASES.push(...STAGE_B.map((id): [string, string, unknown] => [id, 'example', example(id)]), ...MORE);
const LONG = MORE.filter(([, name]) => name === 'long');

/** The round layout's markup after its truncate kept `keep` items. */
async function roundMarkup(id: string, data: unknown, keep: number): Promise<string> {
  const t = renderer.registry.get(id) as Template;
  const cut = (t.truncateCircle ?? t.truncate)!(t.schema.parse(data), keep);
  const ctx = {
    width: 450,
    height: 450,
    circle: { diameter: 466, safe: 450 },
    theme: buildTheme(PRESETS.dark!, 'dark'),
    detail: 'standard' as const,
    renderBlock: async () => html``,
    include: async () => html``,
  };
  return (await t.renderCircle!(cut.data, ctx)).value;
}

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

  for (const id of ['gauge', 'activity', 'weather', 'stats', ...STAGE_B]) {
    test(`${id}: a rectangle uses the usual layout and none of the round CSS`, async () => {
      const opts = { width: 466, height: 466, scale: 1, overflow: 'cap', theme: 'dark' } as const;
      const plain = await renderer.toHtml(id, example(id), opts);
      // stock_quote numbers its chart gradients per process; the rest must match byte for byte.
      const same = (h: string) => h.replace(/\bpc\d+\b/g, 'pc');
      assert.equal(same((await renderer.toHtml(id, example(id), { ...opts, shape: 'rect' })).html), same(plain.html));
      assert.doesNotMatch(plain.html, /circle-own|gg-round|at-rings|wx-rhead|st-rhead/);
    });
  }

  for (const [id, , data] of LONG) {
    test(`${id}: a long list shows what fits on the circle and a "+N more" line`, async () => {
      const res = await renderer.render(id, data, ROUND);
      assert.ok(res.capped && res.capped.shown < res.capped.total, JSON.stringify(res.capped));
      const markup = await roundMarkup(id, data, res.capped.shown);
      assert.match(markup, /class="[^"]*circle-row[^"]*"[^>]*>\+\d+ more</);
    });
  }

  test('table keeps the label and two value columns; markdown turns tables and code into one line', async () => {
    const table = await renderer.toHtml('table', example('table'), ROUND);
    assert.match(table.html, />Region</);
    assert.match(table.html, />YoY</);
    assert.doesNotMatch(table.html, />Customers<|>Health</);
    const md = await renderer.toHtml('markdown', example('markdown'), ROUND);
    assert.match(md.html, /table · 2 rows/);
    assert.match(md.html, /code · 1 line/);
    assert.doesNotMatch(md.html, /<table/);
  });

  test('status page drops the day strips; pie chart keeps every slice in the donut', async () => {
    const status = await renderer.toHtml('status_page', example('status_page'), ROUND);
    assert.doesNotMatch(status.html, /class="ss-bars"/);
    const pie = await roundMarkup('pie_chart', example('pie_chart'), 2);
    assert.equal(pie.match(/class="pie-row circle-row"/g)?.length, 2);
    assert.match(pie, /\+4 more/);
    assert.equal(pie.match(/<path /g)!.length >= 6, true);
  });
});
