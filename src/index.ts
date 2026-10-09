import { Registry } from './registry.ts';
import { Renderer, type RendererOptions } from './render/renderer.ts';
import { builtinTemplates } from './templates/index.ts';

export { Registry } from './registry.ts';
export { Renderer, TemplateDataError, TemplateNotFoundError, renderOptionsSchema } from './render/renderer.ts';
export type { HtmlResult, RenderOptions, RenderResult, RendererOptions } from './render/renderer.ts';
export { BrowserPool, type BrowserOptions } from './render/browser.ts';
export { createServer, type ServerOptions } from './server.ts';
export { startHttpServer, type HttpOptions } from './http.ts';
export { builtinTemplates } from './templates/index.ts';
export { defineTemplate, CATEGORIES, type Category, type RenderContext, type Template } from './core/types.ts';
export { html, raw, style, Html } from './core/html.ts';
export { getTheme, type Theme } from './core/theme.ts';

/** A registry preloaded with every built-in template. */
export function defaultRegistry(): Registry {
  return new Registry(builtinTemplates);
}

/** A renderer over the built-in templates. */
export function createRenderer(opts: Partial<RendererOptions> = {}): Renderer {
  return new Renderer({ registry: opts.registry ?? defaultRegistry(), ...opts });
}
