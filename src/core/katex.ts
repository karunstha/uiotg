import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import katex from 'katex';
import { ASSET_ORIGIN } from './fonts.ts';
import { raw, type Html } from './html.ts';

const require = createRequire(import.meta.url);
const DIST = join(dirname(require.resolve('katex/package.json')), 'dist');

let css: string | undefined;

/** KaTeX's stylesheet with its fonts pointed at the in-memory asset route (woff2 only). */
export function katexCss(): string {
  css ??= readFileSync(join(DIST, 'katex.min.css'), 'utf8').replace(
    /src:url\(fonts\/([^)]+)\.woff2\) format\("woff2"\)[^;}]*/g,
    (_, name: string) => `src:url(${ASSET_ORIGIN}/katex/${name}.woff2) format("woff2")`,
  );
  return css;
}

/** Bytes for `/katex/<font>.woff2`. */
export function katexAsset(pathname: string): Buffer | undefined {
  const name = /^\/katex\/(KaTeX_[A-Za-z0-9_-]+\.woff2)$/.exec(pathname)?.[1];
  if (!name) return undefined;
  try {
    return readFileSync(join(DIST, 'fonts', name));
  } catch {
    return undefined;
  }
}

/** Renders TeX to HTML; invalid TeX renders in the error color instead of throwing. */
export function tex(source: string, display: boolean): Html {
  return raw(katex.renderToString(source, { displayMode: display, throwOnError: false, output: 'html', strict: 'ignore' }));
}
