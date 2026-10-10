import assert from 'node:assert/strict';
import { after, describe, test } from 'node:test';
import { createRenderer, html, raw } from '../src/index.ts';
import { makeAxisFormatter, makeFormatter } from '../src/core/format.ts';
import { TemplateDataError, TemplateNotFoundError } from '../src/render/renderer.ts';
import { BASE_CSS } from '../src/render/base-css.ts';
import { katexCss } from '../src/core/katex.ts';

const renderer = createRenderer();
after(() => renderer.close());

describe('every template', () => {
  for (const t of renderer.registry.list()) {
    test(`${t.id}: example validates, has a JSON schema and builds HTML in both themes`, async () => {
      assert.ok(t.schema.safeParse(t.example).success, `example for ${t.id} should validate`);
      const schema = renderer.registry.jsonSchema(t.id);
      assert.equal(schema.type, 'object');
      assert.ok(t.description.length > 40, 'descriptions should tell a model when to use the template');
      for (const theme of ['light', 'dark'] as const) {
        const doc = await renderer.toHtml(t.id, t.example, { theme });
        assert.match(doc.html, /^<!doctype html>/);
        assert.ok(doc.width >= 160);
        assert.doesNotMatch(doc.html, /undefined|\[object Object\]|NaN/, `${t.id} leaked a raw JS value into markup`);
      }
    });
  }
});

test('no two templates define the same CSS class', () => {
  // Classes from the shared base stylesheet (.icon, .tag, …) are vocabulary every template may target.
  const shared = new Set((BASE_CSS + katexCss()).match(/\.[a-z][a-z0-9-]*/g) ?? []);
  const owner = new Map<string, string>();
  for (const t of renderer.registry.list()) {
    const classes = new Set((t.css ?? '').match(/\.[a-z][a-z0-9-]*/g) ?? []);
    for (const c of classes) {
      if (shared.has(c)) continue;
      const prev = owner.get(c);
      assert.ok(!prev || prev === t.id, `${c} is defined by both ${prev} and ${t.id}`);
      owner.set(c, t.id);
    }
  }
});

describe('validation', () => {
  test('reports issue paths for bad data', async () => {
    await assert.rejects(
      renderer.toHtml('bar_chart', { categories: ['a', 'b'], series: [{ name: 's', values: [1] }] }),
      (err: unknown) => {
        assert.ok(err instanceof TemplateDataError);
        assert.ok(err.issues.some((i) => i.startsWith('series[0].values')), err.message);
        return true;
      },
    );
  });

  test('prefixes nested dashboard errors with the block path', async () => {
    await assert.rejects(
      renderer.toHtml('dashboard', { blocks: [{ template: 'stats', data: { items: [] } }] }),
      (err: unknown) => {
        assert.ok(err instanceof TemplateDataError);
        assert.ok(err.issues.some((i) => i.startsWith('blocks[0].data.items')), err.message);
        return true;
      },
    );
  });

  test('rejects nesting layout templates', async () => {
    await assert.rejects(
      renderer.toHtml('dashboard', { blocks: [{ template: 'dashboard', data: { blocks: [] } }] }),
      TemplateDataError,
    );
  });

  test('unknown template lists the available ones', async () => {
    await assert.rejects(renderer.toHtml('nope', {}), (err: unknown) => {
      assert.ok(err instanceof TemplateNotFoundError);
      assert.match(err.message, /bar_chart/);
      return true;
    });
  });

  test('accepts data sent as a JSON string', async () => {
    const doc = await renderer.toHtml('quote', JSON.stringify({ quote: 'Hello' }));
    assert.match(doc.html, /Hello/);
  });

  test('escapes user text', async () => {
    const doc = await renderer.toHtml('quote', { quote: '<script>alert(1)</script>', author: '"Bobby" <b>' });
    assert.doesNotMatch(doc.html, /<script>alert/);
    assert.match(doc.html, /&lt;script&gt;/);
  });

  test('rejects non-http image URLs', async () => {
    await assert.rejects(renderer.toHtml('profile_card', { name: 'A', avatar_url: 'file:///etc/passwd' }), TemplateDataError);
  });
});

describe('formatting', () => {
  test('formats numbers', () => {
    assert.equal(makeFormatter()(1234.567), '1,234.57');
    assert.equal(makeFormatter('compact')(12_900), '12.9K');
    assert.equal(makeFormatter('percent')(0.256), '25.6%');
    assert.equal(makeFormatter('currency')(1234.5), '$1,234.50');
    assert.equal(makeFormatter('currency_compact')(4_210_000), '$4.2M');
    assert.equal(makeFormatter({ suffix: ' ms', decimals: 0 })(212.4), '212 ms');
    assert.equal(makeFormatter('integer')(-3.6), '−4');
  });

  test('axis ticks drop zero decimals and compact large values', () => {
    assert.equal(makeAxisFormatter('currency', 200)(200), '$200');
    assert.equal(makeAxisFormatter(undefined, 250_000)(250_000), '250K');
  });
});

describe('html helper', () => {
  test('escapes interpolations but not raw()', () => {
    const out = html`<p title="${'"x"'}">${'<b>'}${raw('<i>ok</i>')}${['a', 'b']}${null}${false}</p>`;
    assert.equal(out.value, '<p title="&quot;x&quot;">&lt;b&gt;<i>ok</i>ab</p>');
  });

  test('keeps numbers in text unbreakable, but not in attributes', () => {
    const out = html`<p style="${'width:12px'}" data-n="${42}">${'$4.2M'} of ${'1,234 ms'} in ${'October'}</p>`;
    assert.equal(out.value, '<p style="width:12px" data-n="42"><span class="nw">$4.2M</span> of <span class="nw">1,234 ms</span> in October</p>');
  });
});
