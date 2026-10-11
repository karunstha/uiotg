import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, test } from 'node:test';
import { buildTheme, checkTheme, createRenderer, PRESETS, resolveTheme, ThemeStore } from '../src/index.ts';
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
});
