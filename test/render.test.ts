import assert from 'node:assert/strict';
import { after, describe, test } from 'node:test';
import { createRenderer } from '../src/index.ts';

// Keep tests hermetic: remote images fall back to generated placeholders.
process.env.UIOTG_OFFLINE = '1';
const renderer = createRenderer({ browser: { allowNetwork: false } });
after(() => renderer.close());

/** Reads width/height from a PNG's IHDR chunk. */
function pngSize(buf: Buffer): { width: number; height: number } {
  assert.equal(buf.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', 'not a PNG');
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

describe('render', () => {
  test('renders a PNG at the device scale', async () => {
    const r = await renderer.render('stats', { items: [{ label: 'Users', value: 1200 }] }, { scale: 2 });
    assert.equal(r.mimeType, 'image/png');
    const size = pngSize(r.data);
    assert.equal(size.width, r.width * 2);
    assert.equal(size.height, r.height * 2);
    assert.ok(r.height > 80, 'auto height should fit the content');
  });

  test('honors width, fixed height and scale 1', async () => {
    const r = await renderer.render('bar_chart', renderer.registry.get('bar_chart')!.example, { width: 640, height: 400, scale: 1 });
    assert.deepEqual(pngSize(r.data), { width: 640, height: 400 });
  });

  test('renders JPEG', async () => {
    const r = await renderer.render('quote', { quote: 'Ship it.' }, { format: 'jpeg', quality: 80 });
    assert.equal(r.mimeType, 'image/jpeg');
    assert.equal(r.data.subarray(0, 2).toString('hex'), 'ffd8');
  });

  test('renders templates with remote images offline', async () => {
    const t = renderer.registry.get('album_grid')!;
    const r = await renderer.render(t.id, t.example, { theme: 'dark', scale: 1 });
    assert.ok(pngSize(r.data).height > 300);
  });

  test('renders every template concurrently', async () => {
    const results = await Promise.all(
      renderer.registry.list().map((t) => renderer.render(t.id, t.example, { scale: 1 }).then((r) => [t.id, r] as const)),
    );
    for (const [id, r] of results) {
      const size = pngSize(r.data);
      assert.equal(size.width, r.width, id);
      assert.ok(size.height > 30, `${id} rendered suspiciously short (${size.height}px)`);
    }
  });
});
