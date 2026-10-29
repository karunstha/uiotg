import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, test } from 'node:test';
import { z } from 'zod';
import { buildTheme, createRenderer, defaultRegistry, html, PRESETS, ThemeStore, themeSpecSchema } from '../src/index.ts';
import { defineTemplate, type RenderContext, type Template } from '../src/core/types.ts';
import { auditOverflow } from '../src/render/audit.ts';
import { centreContent, circleLayout } from '../src/render/circle.ts';
import { renderOptionsSchema, type RenderOptions } from '../src/render/renderer.ts';
import { SCALE_FLOOR } from '../src/render/shrink.ts';
import { inkBox } from './ink.ts';

// Prints its content budget (see fit.test.ts).
const probe = defineTemplate({
  id: 'probe',
  title: 'Probe',
  category: 'basic',
  summary: 'test probe',
  description: 'Reports the content size the renderer gives it; used by the circle tests only.',
  schema: z.object({}),
  example: {},
  width: 400,
  render: (_d, ctx) => html`<div>${`budget:${ctx.width}x${ctx.height ?? 'auto'}`}</div>`,
});

const store = new ThemeStore(mkdtempSync(join(tmpdir(), 'uiotg-themes-')));
const renderer = createRenderer({ registry: defaultRegistry().register(probe), themes: store });
after(() => renderer.close());

const ROUND = { width: 466, height: 466, scale: 1, overflow: 'cap', shape: 'circle', padding: 12, theme: 'dark' } as const;
const R = 233;
const longItems = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ text: `Item ${i + 1}: a fairly long line of text that wraps onto a second line here` }));
const kvRows = (n: number) => Array.from({ length: n }, (_, i) => ({ label: `Reading number ${i + 1}`, value: `${i * 7 + 3} units` }));

interface Box {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** Loads the document without the renderer's layout pass, optionally runs circleLayout, and reports boxes relative to the root. */
async function inPage(id: string, data: unknown, options: RenderOptions, layout: boolean) {
  const doc = await renderer.toHtml(id, data, options);
  return renderer.browser.withPage({ width: doc.width, height: doc.height ?? 600, scale: 1, colorScheme: doc.theme }, async (page) => {
    await page.setContent(doc.html);
    const pass = layout ? await page.evaluate(circleLayout) : null;
    const boxes = await page.evaluate(() => {
      const root = document.getElementById('root')!.getBoundingClientRect();
      const rel = (el: Element) => {
        const r = el.getBoundingClientRect();
        return { left: r.left - root.left, right: r.right - root.left, top: r.top - root.top, bottom: r.bottom - root.top };
      };
      const content = [...document.querySelectorAll('#root *')].filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && !el.closest('svg *');
      });
      return { rows: [...document.querySelectorAll('.circle-row')].map(rel), content: content.map(rel) };
    });
    return { pass, ...boxes, issues: await page.evaluate(auditOverflow) };
  });
}

const corners = (b: Box) => [b.left, b.right].flatMap((x) => [b.top, b.bottom].map((y) => [x, y] as const));
const insideCircle = (b: Box, radius = R, tol = 1) => corners(b).every(([x, y]) => Math.hypot(x - R, y - R) <= radius + tol);
const outside = (issues: { problem: string }[]) => issues.filter((i) => i.problem === 'outside-circle');

describe('shape option', () => {
  test('accepts rect and circle, rejects anything else', () => {
    for (const shape of ['rect', 'circle']) assert.ok(renderOptionsSchema.safeParse({ shape }).success, shape);
    for (const shape of ['round', 'square', 1, '']) assert.equal(renderOptionsSchema.safeParse({ shape }).success, false, String(shape));
  });

  test('is allowed in theme defaults and in lock', async () => {
    assert.ok(themeSpecSchema.safeParse({ defaults: { shape: 'circle' }, lock: ['shape'] }).success);
    assert.equal(themeSpecSchema.safeParse({ defaults: { shape: 'oval' } }).success, false);
    store.save('round', { base: 'dark', defaults: { width: 466, height: 466, shape: 'circle', padding: 12 }, lock: ['shape'] });
    // Inscribed square: floor((466 - 2 * 8) / √2) = 318, minus 12 padding a side.
    assert.match((await renderer.toHtml('probe', {}, { theme: 'round' })).html, /budget:294x294/);
    assert.match((await renderer.toHtml('probe', {}, { theme: 'round', shape: 'rect' })).html, /budget:294x294/, 'locked');
  });

  test('rect is the default and changes nothing', async () => {
    for (const [id, data] of [
      ['list', { title: 'Today', items: longItems(10) }],
      ['key_value', { title: 'Now', items: kvRows(12) }],
    ] as const) {
      const opts = { width: 466, height: 466, padding: 12, scale: 1, overflow: 'cap' } as const;
      const plain = await renderer.toHtml(id, data, opts);
      assert.equal((await renderer.toHtml(id, data, { ...opts, shape: 'rect' })).html, plain.html);
      assert.doesNotMatch(plain.html, /shape-circle|--circle/);
      assert.match(plain.html, /padding:12px/);
      const a = await renderer.render(id, data, opts);
      const b = await renderer.render(id, data, { ...opts, shape: 'rect' });
      assert.deepEqual([b.width, b.height, b.capped], [a.width, a.height, a.capped]);
      assert.ok(a.data.equals(b.data), `${id}: same image`);
    }
  });

  test('circle without a height is square, and padding defaults to none on top of the rim', async () => {
    const doc = await renderer.toHtml('probe', {}, { width: 466, shape: 'circle' });
    assert.equal(doc.height, 466);
    assert.match(doc.html, /budget:318x318/);
  });
});

describe('circle rows', () => {
  test('the audit flags rows past the circle when the layout pass does not run', async () => {
    const raw = await inPage('list', { title: 'Today', items: longItems(4) }, ROUND, false);
    assert.ok(raw.rows.length >= 5);
    assert.ok(raw.rows.some((b) => !insideCircle(b)), 'full-width rows reach the corners');
    assert.ok(outside(raw.issues).length > 0);
    const laid = await inPage('list', { title: 'Today', items: longItems(4) }, ROUND, true);
    assert.ok(laid.pass!.fits);
    assert.ok(laid.pass!.passes <= 6);
    for (const b of laid.rows) assert.ok(insideCircle(b), JSON.stringify(b));
    assert.deepEqual(outside(laid.issues), []);
  });

  for (const [id, data] of [
    ['list', { title: 'Today', subtitle: '8 open tasks, 1 done', items: longItems(12) }],
    ['key_value', { title: 'Weather', items: kvRows(14) }],
  ] as const) {
    test(`${id}: capped on the circle, every row inside it, never more rows than a rectangle`, async () => {
      const res = await renderer.render(id, data, ROUND);
      assert.deepEqual([res.width, res.height, res.adjusted], [466, 466, undefined]);
      assert.ok(res.capped, 'cut to fit');
      const rect = await renderer.render(id, data, { ...ROUND, shape: 'rect' });
      assert.ok(res.capped.shown <= (rect.capped?.shown ?? rect.capped?.total ?? Infinity), `${res.capped.shown} vs ${rect.capped?.shown}`);
      // Every .circle-row and text run of the capped image, corners within the circle (1 px).
      assert.deepEqual(outside(await renderer.audit(id, data, ROUND)), []);
    });
  }

  test('rows that fit are centred and narrow towards the rim', async () => {
    const page = await inPage('key_value', { title: 'Weather', items: kvRows(7) }, ROUND, true);
    for (const b of page.rows) assert.ok(Math.abs((b.left + b.right) / 2 - R) <= 1, `centred: ${JSON.stringify(b)}`);
    const widths = page.rows.map((b) => b.right - b.left);
    const mid = page.rows.findIndex((b) => b.top <= R && b.bottom >= R);
    assert.ok(mid > 0 && widths[0]! < widths[mid]! && widths.at(-1)! < widths[mid]!, widths.join(','));
  });

  test('a single row sits in the middle of the circle', async () => {
    const page = await inPage('list', { items: [{ text: 'Gym' }] }, ROUND, true);
    assert.equal(page.rows.length, 1);
    const b = page.rows[0]!;
    assert.ok(Math.abs((b.left + b.right) / 2 - R) <= 1 && Math.abs((b.top + b.bottom) / 2 - R) <= 1, JSON.stringify(b));
  });

  test('a long wrapped title stays inside', async () => {
    const data = { title: 'A rather long title that has to wrap over several lines on a round screen', items: longItems(6) };
    const res = await renderer.render('list', data, ROUND);
    assert.deepEqual([res.width, res.height, res.adjusted], [466, 466, undefined]);
    assert.deepEqual(outside(await renderer.audit('list', data, ROUND)), []);
  });

  test('the "+N more" row is a circle row too', async () => {
    for (const id of ['list', 'key_value', 'agenda', 'steps']) {
      const t = renderer.registry.get(id) as Template;
      const cut = t.truncate!(t.schema.parse(t.example), 1);
      const ctx: RenderContext = {
        width: 400,
        theme: buildTheme(PRESETS.dark!, 'dark'),
        detail: 'standard',
        renderBlock: async () => html``,
        include: async () => html``,
      };
      const markup = (await t.render(cut.data, ctx)).value;
      assert.match(markup, /<div class="[^"]*circle-row"[^>]*>[^]*?\+\d+ more/, id);
      assert.equal(t.circle, 'rows', id);
    }
  });
});

describe('circle square', () => {
  // Inscribed square: side 318 centred, plus 12 padding: content within [86, 380].
  const lo = (466 - 318) / 2 + 12;
  const hi = 466 - lo;
  // gauge and stats used to be the examples here; they now have their own round layout (circle-layouts.test.ts).
  for (const [id, data] of [
    ['rating', { label: 'Service', score: 4.2 }],
    ['sparkline', { label: 'Users', value: 1284, values: [3, 5, 4, 6, 8, 7, 9] }],
  ] as const) {
    test(`${id} keeps to the square inside the circle`, async () => {
      const page = await inPage(id, data, ROUND, true);
      assert.ok(page.content.length > 0);
      for (const b of page.content) assert.ok(b.left >= lo - 1 && b.right <= hi + 1 && b.top >= lo - 1 && b.bottom <= hi + 1, `${id}: ${JSON.stringify(b)}`);
      assert.deepEqual(outside(await renderer.audit(id, data, ROUND)), []);
      const res = await renderer.render(id, data, ROUND);
      assert.deepEqual([res.width, res.height, res.adjusted], [466, 466, undefined]);
    });
  }
});

describe('circle centring', () => {
  for (const [id, data] of [
    ['probe', {}],
    ['badge', { label: 'build', value: 'passing', tone: 'success' }],
  ] as const) {
    test(`${id}: compact content sits in the middle of the circle`, async () => {
      const res = await renderer.render(id, data, ROUND);
      assert.deepEqual([res.width, res.height, res.adjusted, res.scaled], [466, 466, undefined, undefined]);
      const ink = (await inkBox(renderer, res.data, 466, 466))!;
      assert.ok(Math.abs((ink.left + ink.right) / 2 - R) <= 2, `x: ${JSON.stringify(ink)}`);
      assert.ok(Math.abs((ink.top + ink.bottom) / 2 - R) <= 2, `y: ${JSON.stringify(ink)}`);
    });
  }

  test('row layouts and rect are left alone', async () => {
    const doc = await renderer.toHtml('list', { items: longItems(2) }, ROUND);
    const moved = await renderer.browser.withPage({ width: 466, height: 466, scale: 1, colorScheme: doc.theme }, async (page) => {
      await page.setContent(doc.html);
      await page.evaluate(circleLayout);
      return page.evaluate(centreContent);
    });
    assert.deepEqual(moved, { dx: 0, dy: 0 });
    const rect = await renderer.render('probe', {}, { ...ROUND, shape: 'rect' });
    const ink = (await inkBox(renderer, rect.data, 466, 466))!;
    assert.ok(ink.left <= 14 && ink.top <= 16, `top-left as before: ${JSON.stringify(ink)}`);
  });

  // progress used to be the example here; it now has its own round layout (circle-layouts.test.ts).
  test('content too big for the square shrinks into it, centred', async () => {
    const t = renderer.registry.get('code')!;
    const res = await renderer.render('code', t.example, ROUND);
    assert.deepEqual([res.width, res.height, res.adjusted], [466, 466, undefined]);
    assert.ok(res.scaled && res.scaled >= SCALE_FLOOR && res.scaled < 1, `scaled ${res.scaled}`);
    // Inscribed square 318 plus padding 12: the content box is [86, 380] on both axes.
    const ink = (await inkBox(renderer, res.data, 466, 466))!;
    assert.ok(ink.left >= 85 && ink.right <= 381 && ink.top >= 85 && ink.bottom <= 381, JSON.stringify(ink));
    assert.ok(Math.abs((ink.top + ink.bottom) / 2 - R) <= 2, `centred: ${JSON.stringify(ink)}`);
  });
});
