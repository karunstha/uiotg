import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, test } from 'node:test';
import { buildTheme, checkTheme, createRenderer, PRESETS, resolveTheme, ThemeStore, themeSpecSchema } from '../src/index.ts';
import { contrast } from '../src/core/theme.ts';

const store = new ThemeStore(mkdtempSync(join(tmpdir(), 'uiotg-themes-')));
const renderer = createRenderer({ themes: store });
after(() => renderer.close());

describe('themes', () => {
  test('every preset is readable and its chart colors are distinct', () => {
    for (const [name, spec] of Object.entries(PRESETS)) {
      const report = checkTheme(buildTheme(spec, name));
      assert.deepEqual(report, { errors: [], warnings: [] }, name);
    }
  });

  test('derives every token from three seeds', () => {
    const t = buildTheme({ base: 'dark', background: '#0b0000', text: '#f5e6e6', accent: '#c1121f' });
    assert.equal(t.surface, '#0b0000');
    assert.equal(t.series[0], '#c1121f');
    assert.equal(t.series.length, 8);
    assert.equal(new Set(t.series).size, 8);
    assert.ok(contrast(t.text2, t.surface) >= 4.5, 'secondary text stays readable');
    assert.ok(contrast(t.muted, t.surface) >= 3, 'muted text stays legible');
    assert.equal(t.onAccent, '#ffffff');
  });

  test('flags unreadable text as an error and look-alike series as a warning', () => {
    const bad = checkTheme(buildTheme({ background: '#ffc0cb', text: '#ff69b4', series: ['#e0457b', '#e2487d'] }));
    assert.ok(bad.errors.some((e) => e.startsWith('text on background')));
    assert.ok(bad.warnings.some((w) => /hard to tell apart/.test(w)));
  });

  test('font and corners reach the page', async () => {
    const doc = await renderer.toHtml('stats', { items: [{ label: 'A', value: 1 }] }, { theme: 'terminal' });
    assert.match(doc.html, /--font-sans:'JetBrains Mono'/);
    assert.match(doc.html, /--rk:0/);
    assert.equal(doc.theme, 'dark');
  });

  test('accepts an inline theme object per render', async () => {
    const doc = await renderer.toHtml('stats', { items: [{ label: 'A', value: 1 }] }, { theme: { background: '#fff0f5', text: '#3b1d2a', accent: '#e0457b', corners: 'round' } });
    assert.match(doc.html, /--accent:#e0457b/);
    assert.match(doc.html, /--rk:1.6/);
  });

  test('an inline theme without defaults only restyles: it inherits the default theme screen and locks', () => {
    store.save('rounddev', { base: 'dark', defaults: { width: 466, height: 466, shape: 'circle', padding: 14, overflow: 'cap' }, lock: ['width', 'height', 'shape'] });
    store.save('plain2', { base: 'dark' });
    store.setDefault('rounddev');
    try {
      const inline = { base: 'dark', accent: '#7aa2ff', background: '#0b0f1a' } as const;
      const eff = renderer.effectiveOptions({ theme: inline, width: 368, height: 448, padding: 20, overflow: 'grow' });
      assert.equal(eff.width, 466, 'locked size wins');
      assert.equal(eff.height, 466);
      assert.equal(eff.shape, 'circle');
      assert.equal(eff.padding, 20, 'unlocked: the call wins');
      assert.equal(eff.overflow, 'grow');
      assert.deepEqual((eff.theme as { accent?: string }).accent, '#7aa2ff', 'its colors are kept');
      // An inline theme with its own defaults, or a named theme, is on its own.
      const own = renderer.effectiveOptions({ theme: { ...inline, defaults: { width: 300 } }, width: 368 });
      assert.equal(own.width, 368);
      assert.equal(own.shape, undefined);
      assert.equal(renderer.effectiveOptions({ theme: 'plain2', width: 368 }).width, 368);
      // No call theme: the default theme itself.
      assert.equal(renderer.effectiveOptions({ width: 368 }).width, 466);
    } finally {
      store.setDefault(undefined);
    }
  });

  test('resolves saved themes, falls back from a deleted default, and protects preset names', () => {
    store.save('blood', { base: 'dark', background: '#0b0000', text: '#f5e6e6', accent: '#c1121f' });
    assert.equal(resolveTheme('blood', store).surface, '#0b0000');
    store.setDefault('gone');
    assert.equal(renderer.themes.getDefault(), 'gone');
    assert.throws(() => store.save('nord', {}), /built-in preset/);
    assert.throws(() => resolveTheme('nope', store), /Unknown theme "nope".*blood/);
    store.setDefault(undefined);
  });

  test('a missing default falls back to light', async () => {
    store.setDefault('gone');
    const doc = await renderer.toHtml('stats', { items: [{ label: 'A', value: 1 }] });
    assert.match(doc.html, /--surface:#fcfcfb/);
    store.setDefault(undefined);
  });

  test('photo cards keep the theme colors but go light-on-dark', async () => {
    const doc = await renderer.toHtml('countdown', { label: 'Soon', days: 3, background_url: 'https://example.com/x.jpg' }, { theme: 'solarized' });
    assert.equal(doc.theme, 'dark');
    assert.match(doc.html, /--text:#ffffff/);
    assert.match(doc.html, /--accent:#268bd2/);
  });

  test('defaults accept render options with the same limits, and nothing else', () => {
    const ok = themeSpecSchema.safeParse({ defaults: { width: 466, height: 466, padding: 60, scale: 1, format: 'jpeg', quality: 80, detail: 'minimal' } });
    assert.ok(ok.success);
    assert.equal(themeSpecSchema.safeParse({ defaults: { theme: 'dark' } }).success, false, 'theme is not a default');
    assert.equal(themeSpecSchema.safeParse({ defaults: { accent: '#ff0000' } }).success, false, 'accent is not a default');
    assert.equal(themeSpecSchema.safeParse({ defaults: { transparent: true } }).success, false, 'transparent is not a default');
    assert.equal(themeSpecSchema.safeParse({ defaults: { padding: 500 } }).success, false, 'padding over 160');
    assert.equal(themeSpecSchema.safeParse({ defaults: { width: 100 } }).success, false, 'width under 160');
  });

  test('the saved default theme brings its defaults; call options win', async () => {
    store.save('round', { base: 'dark', background: '#000000', defaults: { width: 466, height: 466, padding: 60, detail: 'minimal' } });
    store.setDefault('round');
    try {
      const data = { items: [{ label: 'A', value: 1 }] };
      const doc = await renderer.toHtml('stats', data);
      assert.deepEqual([doc.width, doc.height, doc.detail], [466, 466, 'minimal']);
      assert.match(doc.html, /padding:60px/);
      const own = await renderer.toHtml('stats', data, { width: 600, padding: 10 });
      assert.deepEqual([own.width, own.height], [600, 466]);
      assert.match(own.html, /padding:10px/);
      const preset = await renderer.toHtml('stats', data, { theme: 'dark' });
      assert.notEqual(preset.width, 466, 'presets have no defaults');
      assert.equal(preset.height, undefined);
    } finally {
      store.setDefault(undefined);
    }
  });
});
