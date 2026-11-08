import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, test } from 'node:test';
import { z } from 'zod';
import { buildTheme, createRenderer, defaultRegistry, html, PRESETS, ThemeStore, themeSpecSchema } from '../src/index.ts';
import { defineTemplate, type RenderContext, type Template } from '../src/core/types.ts';
import { renderOptionsSchema } from '../src/render/renderer.ts';
import { measureFit, scaleContent, SCALE_FLOOR } from '../src/render/shrink.ts';
import { inkBox } from './ink.ts';

// Prints its content budget, and grows `tall` px high or `wide` px wide (outlined) when asked; it has no truncate.
const probe = defineTemplate({
  id: 'probe',
  title: 'Probe',
  category: 'basic',
  summary: 'test probe',
  description: 'Reports the content size the renderer gives it; used by the fit tests only.',
  schema: z.object({ tall: z.number().default(0), wide: z.number().default(0) }),
  example: {},
  width: 400,
  render: (d, ctx) =>
    html`<div style="${`height:${d.tall}px${d.wide ? `;min-width:${d.wide}px` : ''}${d.tall || d.wide ? ';box-shadow:inset 0 0 0 2px #888' : ''}`}">${`budget:${ctx.width}x${ctx.height ?? 'auto'}`}</div>`,
});

const store = new ThemeStore(mkdtempSync(join(tmpdir(), 'uiotg-themes-')));
const renderer = createRenderer({ registry: defaultRegistry().register(probe), themes: store });
after(() => renderer.close());

const BOARD = { width: 466, height: 466, padding: { x: 50, y: 56 }, scale: 1 } as const;
const longItems = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ text: `Item ${i + 1}: a fairly long line of text that wraps onto a second line here` }));

/** Renders a template's truncated data straight to markup, to see the marker. */
async function truncated(id: string, data: unknown, keep: number) {
  const t = renderer.registry.get(id) as Template;
  assert.ok(t.truncate, `${id} has truncate`);
  const cut = t.truncate(t.schema.parse(data), keep);
  const ctx: RenderContext = {
    width: 400,
    theme: buildTheme(PRESETS.light!, 'light'),
    detail: 'standard',
    renderBlock: async () => html``,
    include: async () => html``,
  };
  return { ...cut, markup: (await t.render(cut.data, ctx)).value };
}

describe('padding', () => {
  test('a number still means every side', async () => {
    const doc = await renderer.toHtml('probe', {}, { width: 400, height: 300, padding: 20 });
    assert.match(doc.html, /budget:360x260/);
    assert.match(doc.html, /padding:20px/);
  });

  test('{x, y} pads left/right by x and top/bottom by y', async () => {
    const doc = await renderer.toHtml('probe', {}, { width: 466, height: 466, padding: { x: 50, y: 56 } });
    assert.match(doc.html, /budget:366x354/);
    assert.match(doc.html, /padding:56px 50px/);
  });

  test('rejects a bad padding object', () => {
    for (const padding of [{ x: 10 }, { x: 10, y: 200 }, { x: -1, y: 0 }, { x: 1.5, y: 2 }, { x: 1, y: 1, z: 1 }]) {
      assert.equal(renderOptionsSchema.safeParse({ padding }).success, false, JSON.stringify(padding));
    }
  });

  test('theme defaults accept either form', async () => {
    assert.ok(themeSpecSchema.safeParse({ defaults: { padding: 24 } }).success);
    assert.ok(themeSpecSchema.safeParse({ defaults: { padding: { x: 50, y: 56 } } }).success);
    assert.equal(themeSpecSchema.safeParse({ defaults: { padding: { x: 50 } } }).success, false);
    store.save('padxy', { base: 'dark', defaults: { width: 466, height: 466, padding: { x: 50, y: 56 } } });
    const doc = await renderer.toHtml('probe', {}, { theme: 'padxy' });
    assert.match(doc.html, /budget:366x354/);
  });
});

describe('overflow', () => {
  const data = { title: 'Today', items: longItems(10) };

  test('grow (the default) still grows the image', async () => {
    for (const overflow of [undefined, 'grow'] as const) {
      const res = await renderer.render('list', data, { ...BOARD, overflow });
      assert.equal(res.width, 466);
      assert.ok(res.height > 466);
      assert.deepEqual(res.adjusted?.height, [466, res.height]);
      assert.equal(res.capped, undefined);
    }
  });

  test('cap keeps the exact size and shows fewer items', async () => {
    const res = await renderer.render('list', data, { ...BOARD, overflow: 'cap' });
    assert.equal(res.width, 466);
    assert.equal(res.height, 466);
    assert.equal(res.adjusted, undefined);
    assert.ok(res.capped, 'reports the cut');
    assert.equal(res.capped.total, 10);
    assert.ok(res.capped.shown >= 1 && res.capped.shown < res.capped.total);
    assert.equal(res.scaled, undefined, 'a template with truncate shows fewer items rather than shrinking');
    const few = await renderer.render('list', { items: longItems(2) }, { ...BOARD, overflow: 'cap' });
    assert.equal(few.capped, undefined, 'content that fits is not cut');
  });

  test('cap keeps at least one item, growing if even that is too tall', async () => {
    const huge = { items: [{ text: 'x '.repeat(190) }, { text: 'y '.repeat(190) }, { text: 'z' }] };
    const res = await renderer.render('list', huge, { width: 200, height: 120, padding: 8, scale: 1, overflow: 'cap' });
    assert.deepEqual(res.capped, { shown: 1, total: 3 });
    assert.ok(res.adjusted?.height, 'one item is still taller than the image');
    assert.equal(res.scaled, undefined, 'and too tall to shrink to the floor');
  });

  /** Renders with cap, checks the size, and that the content drawn stays inside the padded box. */
  async function shrunk(data: { tall?: number; wide?: number }, shape: 'rect' | 'circle' = 'rect') {
    const opts = { ...BOARD, overflow: 'cap', shape } as const;
    const res = await renderer.render('probe', data, opts);
    assert.deepEqual([res.width, res.height, res.adjusted, res.capped], [466, 466, undefined, undefined]);
    assert.ok(res.scaled && res.scaled >= SCALE_FLOOR && res.scaled < 1, `scaled ${res.scaled}`);
    // In the page: at that factor the content fits the box.
    const doc = await renderer.toHtml('probe', data, opts);
    const fit = await renderer.browser.withPage({ width: 466, height: 466, scale: 1, colorScheme: doc.theme }, async (page) => {
      await page.setContent(doc.html);
      await page.evaluate(scaleContent, res.scaled!);
      return page.evaluate(measureFit);
    });
    assert.equal(fit.over, false, JSON.stringify(fit));
    return { res, ink: (await inkBox(renderer, res.data, 466, 466))! };
  }

  test('a template without truncate shrinks to keep the size instead of growing', async () => {
    const { res, ink } = await shrunk({ tall: 450 });
    assert.ok(res.scaled! < 0.85, `scaled ${res.scaled}`);
    // The outlined block spans the padded box's height: 56 top and bottom.
    assert.ok(ink.top >= 56 && ink.bottom <= 410 && ink.left >= 50 && ink.right <= 416, JSON.stringify(ink));
    assert.ok(ink.bottom >= 400, `uses the room: ${JSON.stringify(ink)}`);
  });

  test('content too wide shrinks too, and lays out wider', async () => {
    const { res, ink } = await shrunk({ wide: 500, tall: 100 });
    assert.ok(Math.abs(res.scaled! - 366 / 500) < 0.02, `scaled ${res.scaled}`);
    assert.ok(ink.left >= 50 && ink.right <= 416 && ink.right >= 410, JSON.stringify(ink));
  });

  test('below the floor it grows as before, unscaled', async () => {
    const res = await renderer.render('probe', { tall: 2000 }, { ...BOARD, overflow: 'cap' });
    assert.equal(res.scaled, undefined);
    assert.equal(res.capped, undefined);
    assert.ok(res.height > 2000);
    assert.deepEqual(res.adjusted?.height, [466, res.height]);
  });

  test('grow, and cap without a fixed height, never shrink', async () => {
    const grown = await renderer.render('probe', { tall: 450 }, { ...BOARD, overflow: 'grow' });
    assert.deepEqual([grown.scaled, grown.adjusted?.height?.[0]], [undefined, 466]);
    const free = await renderer.render('probe', { tall: 450 }, { width: 466, padding: 20, scale: 1, overflow: 'cap' });
    assert.deepEqual([free.scaled, free.adjusted], [undefined, undefined]);
    assert.ok(free.height > 466);
  });

  test('cap without a fixed height fits the content', async () => {
    const res = await renderer.render('list', data, { width: 466, scale: 1, overflow: 'cap' });
    assert.equal(res.capped, undefined);
    assert.equal(res.adjusted, undefined);
    assert.ok(res.height > 466);
  });

  test('a theme default of cap applies; the call can switch back to grow', async () => {
    store.save('capped', { base: 'dark', defaults: { ...BOARD, overflow: 'cap' } });
    const capped = await renderer.render('list', data, { theme: 'capped' });
    assert.equal(capped.height, 466);
    assert.ok(capped.capped);
    const grown = await renderer.render('list', data, { theme: 'capped', overflow: 'grow' });
    assert.ok(grown.height > 466);
    assert.equal(grown.capped, undefined);
  });

  test('a locked default cannot be overridden by the call; unlocked ones can', async () => {
    store.save('locked', { base: 'dark', defaults: { ...BOARD, overflow: 'cap' }, lock: ['height', 'overflow'] });
    const res = await renderer.render('list', data, { theme: 'locked', height: 900, overflow: 'grow', width: 500 });
    assert.equal(res.height, 466, 'height locked');
    assert.ok(res.capped, 'overflow locked to cap');
    assert.equal(res.width, 500, 'width not locked, the call wins');
  });

  test('lock only names options of the theme defaults, and a lock without a default does nothing', async () => {
    assert.equal(themeSpecSchema.safeParse({ lock: ['height', 'padding'] }).success, true);
    assert.equal(themeSpecSchema.safeParse({ lock: ['theme'] }).success, false);
    store.save('nolockval', { base: 'dark', defaults: { width: 466 }, lock: ['height'] });
    // The probe template has no content to grow the image, so the height is what the call asked for.
    const res = await renderer.render('probe', {}, { theme: 'nolockval', height: 700 });
    assert.equal(res.height, 700);
  });

  test('table and key_value cap their rows', async () => {
    const rows = Array.from({ length: 30 }, (_, i) => ({ name: `Row ${i + 1}`, value: i * 10 }));
    const table = await renderer.render('table', { title: 'Rows', rows }, { ...BOARD, overflow: 'cap' });
    assert.equal(table.height, 466);
    assert.ok(table.capped && table.capped.shown < 30);
    const items = Array.from({ length: 30 }, (_, i) => ({ label: `Key ${i + 1}`, value: i }));
    const kv = await renderer.render('key_value', { items }, { ...BOARD, overflow: 'cap' });
    assert.equal(kv.height, 466);
    assert.ok(kv.capped && kv.capped.shown < 30);
  });
});

describe('truncate', () => {
  test('list, table and key_value keep the first items and add "+N more"', async () => {
    const list = await truncated('list', { items: longItems(8) }, 5);
    assert.deepEqual([list.shown, list.total], [5, 8]);
    assert.match(list.markup, /\+3 more/);
    assert.doesNotMatch(list.markup, /Item 6/);

    const table = await truncated('table', { rows: [{ a: 1 }, { a: 2 }, { a: 3 }], footer: { a: 6 } }, 1);
    assert.deepEqual([table.shown, table.total], [1, 3]);
    assert.match(table.markup, /<tr class="tb-more"><td colspan="1">\+2 more<\/td><\/tr><\/tbody>/);
    assert.match(table.markup, /<tfoot>/, 'the totals row stays');

    const kv = await truncated('key_value', { items: [{ label: 'A', value: 1 }, { label: 'B', value: 2 }] }, 1);
    assert.deepEqual([kv.shown, kv.total], [1, 2]);
    assert.match(kv.markup, /\+1 more/);
  });

  test('nothing cut, no marker; keep is at least one', async () => {
    const all = await truncated('list', { items: longItems(3) }, 10);
    assert.deepEqual([all.shown, all.total], [3, 3]);
    assert.doesNotMatch(all.markup, /more</);
    const one = await truncated('list', { items: longItems(3) }, 0);
    assert.equal(one.shown, 1);
  });

  test('every truncating template marks the cut on its example', async () => {
    for (const t of renderer.registry.list()) {
      if (!t.truncate) continue;
      const cut = await truncated(t.id, t.example, 1);
      if (cut.total > cut.shown) assert.match(cut.markup, /\+\d+ more/, t.id);
    }
  });
});
