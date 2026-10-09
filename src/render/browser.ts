import { chromium, type Browser, type LaunchOptions, type Page, type Route } from 'playwright';
import { ASSET_ORIGIN, fontAsset } from '../core/fonts.ts';

export interface BrowserOptions {
  /** Explicit Chromium/Chrome binary. Defaults to $UIOTG_CHROMIUM_PATH. */
  executablePath?: string;
  /** Max pages rendering at once. */
  concurrency?: number;
  /** Let pages fetch remote images (album art, avatars). Defaults to true unless $UIOTG_OFFLINE=1. */
  allowNetwork?: boolean;
}

export interface PageOptions {
  width: number;
  height: number;
  scale: number;
  colorScheme: 'light' | 'dark';
}

const ALLOWED_REMOTE = new Set(['image', 'media', 'font', 'stylesheet']);

/**
 * Owns one headless Chromium, launched lazily and relaunched if it dies. Every
 * render gets a fresh, JavaScript-disabled context, so templates are pure
 * HTML/CSS/SVG and user-supplied markup can't run scripts.
 */
export class BrowserPool {
  #browser: Promise<Browser> | undefined;
  #active = 0;
  #waiting: Array<() => void> = [];
  readonly #opts: Required<Omit<BrowserOptions, 'executablePath'>> & { executablePath?: string };

  constructor(opts: BrowserOptions = {}) {
    this.#opts = {
      executablePath: opts.executablePath ?? (process.env.UIOTG_CHROMIUM_PATH || undefined),
      concurrency: opts.concurrency ?? 4,
      allowNetwork: opts.allowNetwork ?? process.env.UIOTG_OFFLINE !== '1',
    };
  }

  async #launch(): Promise<Browser> {
    const base: LaunchOptions = { headless: true, timeout: 60_000 };
    const attempts: Array<[string, LaunchOptions]> = this.#opts.executablePath
      ? [[this.#opts.executablePath, { ...base, executablePath: this.#opts.executablePath }]]
      : [
          ['Playwright Chromium', base],
          ['Google Chrome', { ...base, channel: 'chrome' }],
          ['Microsoft Edge', { ...base, channel: 'msedge' }],
        ];
    const errors: string[] = [];
    for (const [name, options] of attempts) {
      try {
        return await chromium.launch(options);
      } catch (err) {
        errors.push(`${name}: ${(err as Error).message.split('\n')[0]}`);
      }
    }
    throw new Error(
      'uiotg could not start a headless browser.\n' +
        'Install one with `npx playwright install chromium-headless-shell`, ' +
        'or point UIOTG_CHROMIUM_PATH at a Chrome/Chromium binary.\n' +
        errors.map((e) => `  - ${e}`).join('\n'),
    );
  }

  async #getBrowser(): Promise<Browser> {
    if (!this.#browser) {
      this.#browser = this.#launch();
      this.#browser.catch(() => (this.#browser = undefined));
    }
    const browser = await this.#browser;
    if (!browser.isConnected()) {
      this.#browser = undefined;
      return this.#getBrowser();
    }
    return browser;
  }

  async #acquire(): Promise<void> {
    if (this.#active < this.#opts.concurrency) {
      this.#active++;
      return;
    }
    await new Promise<void>((resolve) => this.#waiting.push(resolve));
  }

  #release(): void {
    const next = this.#waiting.shift();
    if (next) next();
    else this.#active--;
  }

  async #route(route: Route): Promise<void> {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin === ASSET_ORIGIN) {
      const body = url.pathname.startsWith('/fonts/') ? fontAsset(url.pathname) : undefined;
      if (body) return route.fulfill({ status: 200, body, contentType: 'font/woff2' });
      return route.abort();
    }
    const remote = url.protocol === 'http:' || url.protocol === 'https:';
    if (remote && this.#opts.allowNetwork && ALLOWED_REMOTE.has(request.resourceType())) return route.continue();
    return route.abort();
  }

  /** Runs `fn` with a fresh page in its own isolated context. */
  async withPage<T>(opts: PageOptions, fn: (page: Page) => Promise<T>): Promise<T> {
    await this.#acquire();
    try {
      const browser = await this.#getBrowser();
      const context = await browser.newContext({
        viewport: { width: opts.width, height: opts.height },
        deviceScaleFactor: opts.scale,
        colorScheme: opts.colorScheme,
        javaScriptEnabled: false,
        serviceWorkers: 'block',
      });
      try {
        await context.route('**/*', (route) => this.#route(route));
        const page = await context.newPage();
        return await fn(page);
      } finally {
        await context.close().catch(() => {});
      }
    } finally {
      this.#release();
    }
  }

  async close(): Promise<void> {
    const pending = this.#browser;
    this.#browser = undefined;
    if (pending) await (await pending.catch(() => undefined))?.close().catch(() => {});
  }
}
