import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, test } from 'node:test';
import { AdaptError, adaptTo, chooseVisual, createRenderer, runnerUp, screenFrom, ThemeStore, type VisualizeInput } from '../src/index.ts';

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
    assert.match(choice.reason, /6 columns are too wide.*name with mrr/);
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

describe('visualize: hints from words and keys', () => {
  const hourly = [{ hour: '6am', tempF: 65 }, { hour: '9am', tempF: 70 }, { hour: '12pm', tempF: 76 }, { hour: '3pm', tempF: 78 }];
  const daily = [
    { day: '2026-11-02', high: 61, low: 44, condition: 'Light rain' },
    { day: '2026-11-03', high: 58, low: 40, condition: 'Sunny' },
    { day: '2026-11-04', high: 55, low: 39, condition: 'Cloudy' },
  ];

  test('hourly forecast rows become weather with hourly data', () => {
    const choice = choose({ data: hourly, title: 'Forecast' });
    assert.equal(choice.template, 'weather', choice.reason);
    valid('weather', choice.data);
    const data = choice.data as { units: string; current: { temperature: number; condition: string }; hourly: Array<{ time: string; temperature: number }> };
    assert.equal(data.units, 'imperial');
    assert.deepEqual(data.hourly.map((x) => x.time), ['6am', '9am', '12pm', '3pm']);
    assert.equal(data.current.temperature, 65);
    assert.equal(data.current.condition, 'partly_cloudy');
  });

  test('daily rows with high and low become a daily forecast', () => {
    const choice = choose({ data: daily });
    assert.equal(choice.template, 'weather', choice.reason);
    valid('weather', choice.data);
    const data = choice.data as { daily: Array<{ day: string; condition: string }> };
    assert.deepEqual(data.daily.map((d) => d.day), ['Mon', 'Tue', 'Wed']);
    assert.deepEqual(data.daily.map((d) => d.condition), ['rain', 'clear', 'cloudy']);
  });

  test('a lone temperature with a weather title is current weather', () => {
    const choice = choose({ data: '18°C', title: 'Outside temperature' });
    assert.equal(choice.template, 'weather');
    valid('weather', choice.data);
  });

  test('weak weather evidence does not fire', () => {
    // ISO timestamps and a temperature, no weather word: a sensor log stays a line chart.
    const log = Array.from({ length: 6 }, (_, i) => ({ time: `2026-10-29T0${i}:00`, temperature: 40 + i }));
    assert.equal(choose({ data: log }).template, 'line_chart');
    assert.equal(choose({ data: log, title: 'CPU temperature' }).template, 'line_chart');
    assert.equal(choose({ data: 21, title: 'Open tickets' }).template, 'stats');
  });

  test('a usage percentage becomes a gauge with thresholds', () => {
    const choice = choose({ data: '72%', title: 'CPU usage' });
    assert.equal(choice.template, 'gauge', choice.reason);
    valid('gauge', choice.data);
    assert.equal(choice.data.value, 72);
    assert.equal((choice.data.thresholds as unknown[]).length, 3);
    const battery = choose({ data: { battery: 0.64 } });
    assert.equal(battery.template, 'gauge');
    assert.equal(battery.data.value, 64);
    assert.equal(battery.data.thresholds, undefined, 'a full battery is good');
  });

  test('weak gauge evidence does not fire', () => {
    assert.equal(choose({ data: 72 }).template, 'stats');
    assert.equal(choose({ data: 720, title: 'Credit score' }).template, 'stats');
    assert.equal(choose({ data: '12%', title: 'Churn' }).template, 'stats');
  });

  test('tasks with done flags become a checklist', () => {
    const choice = choose({ data: [{ task: 'Buy milk', done: true }, { task: 'Call mom', done: false }, { task: 'Pay rent', done: false }] });
    assert.equal(choice.template, 'list', choice.reason);
    assert.equal(choice.data.style, 'check');
    assert.deepEqual((choice.data.items as Array<{ status: string }>).map((i) => i.status), ['done', 'todo', 'todo']);
    // Short strings are tags, unless the title says they are tasks.
    const errands = ['Email Sam', 'Book dentist', 'Pay rent', 'Buy milk', 'Fix bike', 'Water plants'];
    assert.equal(choose({ data: errands }).template, 'tags');
    assert.equal(choose({ data: errands, title: 'Errands' }).template, 'list');
    // A status that isn't a task state is just a column.
    assert.notEqual(choose({ data: [{ name: 'Ada', status: 'active', age: 3 }, { name: 'Bo', status: 'away', age: 4 }] }).template, 'list');
  });

  test('a future date with a countdown phrase becomes a countdown', () => {
    const choice = choose({ data: '2099-12-31T23:59:00Z', title: 'Time until launch' });
    assert.equal(choice.template, 'countdown', choice.reason);
    valid('countdown', choice.data);
    const record = choose({ data: { event: 'Launch', deadline: '2099-01-01' } });
    assert.equal(record.template, 'countdown');
    assert.equal(record.data.label, 'Launch');
    // A date alone, or a past deadline, is not a countdown.
    assert.notEqual(choose({ data: '2099-12-31' }).template, 'countdown');
    assert.notEqual(choose({ data: { deadline: '2001-01-01', owner: 'x' } }).template, 'countdown');
  });

  test('value and max pairs become progress bars', () => {
    const rows = [{ goal: 'Read', done: 7, target: 12 }, { goal: 'Run', done: 30, target: 50 }];
    const choice = choose({ data: rows });
    assert.equal(choice.template, 'progress', choice.reason);
    valid('progress', choice.data);
    assert.deepEqual(choice.data.items, [{ label: 'Read', value: 7, max: 12 }, { label: 'Run', value: 30, max: 50 }]);
    // Two numbers without a value/max pair stay a bar chart.
    const plain = [{ team: 'a', x: 1, y: 2 }, { team: 'b', x: 3, y: 4 }, { team: 'c', x: 5, y: 6 }, { team: 'd', x: 2, y: 2 }, { team: 'e', x: 1, y: 7 }];
    assert.equal(choose({ data: plain }).template, 'bar_chart');
  });

  test('time zones, rings and prices', () => {
    assert.equal(choose({ data: [{ city: 'Tokyo', timezone: 'Asia/Tokyo' }, { city: 'Lisbon', timezone: 'Europe/Lisbon' }] }).template, 'world_clock');
    assert.equal(choose({ data: 'Asia/Tokyo', title: 'Time in Tokyo' }).template, 'clock');
    assert.equal(choose({ data: 'Asia/Tokyo' }).template, 'text_card');
    assert.equal(choose({ data: { move: { value: 420, goal: 600 }, exercise: { value: 25, goal: 30 } } }).template, 'activity');
    const candles = [{ date: '2026-10-01', open: 1, high: 3, low: 0.5, close: 2 }, { date: '2026-10-02', open: 2, high: 4, low: 1, close: 3 }];
    assert.equal(choose({ data: candles }).template, 'candlestick');
    assert.equal(choose({ data: { ticker: 'aapl', price: 231.4, change: 1.2 } }).template, 'stock_quote');
  });
});

describe('visualize: a forced template', () => {
  const adapt = (template: string, input: VisualizeInput) => adaptTo(template, input, renderer.registry);

  test('shapes the data for the forced template', () => {
    // Weak evidence (ISO times, no weather word) is enough once weather is forced.
    const log = Array.from({ length: 4 }, (_, i) => ({ time: `2026-10-29T0${i}:00`, temperature: 10 + i }));
    const weather = adapt('weather', { data: log, title: 'Lisbon' });
    valid('weather', weather.data);
    assert.deepEqual((weather.data.hourly as Array<{ time: string }>).map((x) => x.time), ['00:00', '01:00', '02:00', '03:00']);
    const gauge = adapt('gauge', { data: 42 });
    valid('gauge', gauge.data);
    assert.equal(gauge.data.value, 42);
    const list = adapt('list', { data: [{ name: 'Ada', role: 'eng' }, { name: 'Bo', role: 'pm' }] });
    valid('list', list.data);
    assert.deepEqual(list.data.items, [{ text: 'Ada', meta: 'eng' }, { text: 'Bo', meta: 'pm' }]);
    const table = adapt('table', { data: ['a', 'b'] });
    valid('table', table.data);
    for (const [template, data] of [
      ['bar_chart', { a: 1, b: 2 }],
      ['line_chart', [3, 4, 5]],
      ['pie_chart', [{ k: 'a', v: 1 }, { k: 'b', v: 3 }]],
      ['stats', [{ k: 'a', v: 1 }, { k: 'b', v: 3 }]],
      ['key_value', { a: 1, b: 'x' }],
      ['tags', ['x', 'y']],
      ['text_card', ['one', 'two']],
      ['progress', [{ name: 'a', value: 3 }]],
      ['countdown', '2099-01-01'],
      ['timeline', [{ date: '2026-01-01', what: 'Kickoff' }, { date: '2026-02-01', what: 'Beta' }]],
    ] as const) {
      const choice = adapt(template, { data });
      assert.equal(choice.template, template);
      valid(template, choice.data);
    }
  });

  test('keeps data that already matches and refuses data that cannot fit', () => {
    const example = renderer.registry.get('activity')!.example;
    assert.deepEqual(adapt('activity', { data: example }).data, JSON.parse(JSON.stringify(example)));
    assert.throws(() => adapt('gauge', { data: ['a', 'b'] }), (err: unknown) => err instanceof AdaptError && err.template === 'gauge');
    assert.throws(() => adapt('sankey', { data: [1, 2, 3] }), AdaptError);
    assert.throws(() => adapt('nope', { data: 1 }), /Unknown template "nope". Available: .*gauge/);
  });
});

describe('visualize: size on a small screen', () => {
  const tasks = (n: number) => Array.from({ length: n }, (_, i) => `Task number ${i + 1} with a few words`);

  test('a long list is pre-cut with the total in the subtitle', () => {
    const choice = choose({ data: tasks(40), title: 'Today', screen: round });
    assert.equal(choice.template, 'list');
    const items = choice.data.items as unknown[];
    assert.ok(items.length >= 6 && items.length <= 8, String(items.length));
    assert.equal(choice.data.subtitle, `First ${items.length} of 40`);
    assert.match(choice.reason, /first \d of 40 for the 466 px round screen/);
    valid('list', choice.data);
  });

  test('a short list is untouched, and a long one off a small screen too', () => {
    assert.deepEqual(choose({ data: tasks(8), title: 'Today', screen: round }), choose({ data: tasks(8), title: 'Today' }));
    assert.equal((choose({ data: tasks(40), screen: plain }).data.items as unknown[]).length, 40);
  });

  test('many categories keep the top bars and fold the rest into Other', () => {
    const rows = Array.from({ length: 15 }, (_, i) => ({ region: `Region ${i + 1}`, sales: (i + 1) * 10 }));
    const choice = choose({ data: rows, screen: round });
    assert.equal(choice.template, 'bar_chart');
    assert.equal((choice.data.categories as string[]).length, 8);
    assert.equal((choice.data.categories as string[])[7], 'Other');
    const values = (choice.data.series as Array<{ values: number[] }>)[0]!.values;
    assert.equal(values.reduce((a, b) => a + b, 0), rows.reduce((a, r) => a + r.sales, 0));
    assert.equal(choice.data.subtitle, 'Top 7 of 15, rest as Other');
    valid('bar_chart', choice.data);
    assert.equal((choose({ data: rows, screen: plain }).data.categories as string[]).length, 15);
  });

  test('long series keep their last points', () => {
    const rows = Array.from({ length: 30 }, (_, i) => ({ date: `2026-09-${String(i + 1).padStart(2, '0')}`, visits: 100 + i }));
    const choice = choose({ data: rows, screen: round });
    assert.equal(choice.template, 'line_chart');
    assert.equal((choice.data.x as string[]).length, 12);
    assert.equal(choice.data.subtitle, 'Last 12 of 30');
  });
});

describe('visualize: runner-up', () => {
  const second = (input: VisualizeInput) => runnerUp(input, choose(input), renderer.registry);

  test('names the plain choice behind a hint or a screen swap', () => {
    assert.equal(second({ data: [{ hour: '6am', temp: 18 }, { hour: '9am', temp: 21 }], title: 'Forecast' })?.template, 'line_chart');
    const wideRound = second({ data: wide, screen: round });
    assert.equal(wideRound?.template, 'table');
    assert.match(wideRound!.reason, /kept 3 of 6 columns/);
  });

  test('falls back to a short list per template, or none', () => {
    assert.equal(second({ data: { Chrome: 64, Safari: 19, Edge: 5, Firefox: 3, Other: 9 } })?.template, 'bar_chart');
    assert.equal(second({ data: 42, title: 'Open tickets' }), null);
  });
});
