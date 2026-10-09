import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

/**
 * Bundled fonts are served to the headless browser from memory under this
 * origin (see render/browser.ts), so every unicode subset is available but the
 * browser only fetches the ones a page actually uses.
 */
export const ASSET_ORIGIN = 'https://uiotg.local';

const require = createRequire(import.meta.url);

const SOURCES = [
  { pkg: '@fontsource-variable/inter', css: 'wght.css', family: 'Inter' },
  { pkg: '@fontsource-variable/inter', css: 'wght-italic.css', family: 'Inter' },
  { pkg: '@fontsource-variable/jetbrains-mono', css: 'wght.css', family: 'JetBrains Mono' },
];

let cssCache: string | undefined;
const files = new Map<string, string>();

function load(): string {
  if (cssCache) return cssCache;
  const blocks: string[] = [];
  for (const src of SOURCES) {
    const dir = dirname(require.resolve(`${src.pkg}/package.json`));
    const css = readFileSync(join(dir, src.css), 'utf8');
    for (const block of css.match(/@font-face\s*{[^}]*}/g) ?? []) {
      const file = /url\(\.\/files\/([^)]+)\)/.exec(block)?.[1];
      if (!file) continue;
      files.set(file, join(dir, 'files', file));
      blocks.push(
        block
          .replace(/font-family:[^;]+;/, `font-family:'${src.family}';`)
          .replace(/font-display:[^;]+;/, 'font-display:block;')
          .replace(/url\(\.\/files\/[^)]+\)/, `url(${ASSET_ORIGIN}/fonts/${file})`),
      );
    }
  }
  cssCache = blocks.join('\n');
  return cssCache;
}

/** `@font-face` rules for the bundled fonts. */
export function fontFaceCss(): string {
  return load();
}

const bufferCache = new Map<string, Buffer>();

/** Font file bytes for a request path like `/fonts/inter-latin-wght-normal.woff2`. */
export function fontAsset(pathname: string): Buffer | undefined {
  load();
  const name = pathname.replace(/^\/fonts\//, '');
  const path = files.get(name);
  if (!path) return undefined;
  let buf = bufferCache.get(name);
  if (!buf) {
    buf = readFileSync(path);
    bufferCache.set(name, buf);
  }
  return buf;
}
