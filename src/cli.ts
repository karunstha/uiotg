#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createRenderer } from './index.ts';
import { CATEGORIES } from './core/types.ts';
import { TemplateDataError, type RenderOptions } from './render/renderer.ts';
import { startHttpServer } from './http.ts';
import { createServer, VERSION } from './server.ts';
import { chooseVisual, type Intent } from './auto.ts';
import { minimalData } from './stress.ts';
import { PRESETS } from './core/themes.ts';

const HELP = `uiotg ${VERSION} — User Interface On The Go

Usage:
  uiotg [serve] [--tools single|per-template]   Start the MCP server on stdio (default)
  uiotg serve --http [--port 8080] [--host 0.0.0.0]   Serve MCP over Streamable HTTP at /mcp
  uiotg list                                     List templates
  uiotg schema <template>                        Print a template's JSON schema and example
  uiotg render <template> [options]              Render to an image file
  uiotg html <template> [options]                Write the intermediate HTML document
  uiotg visualize --data <raw> [--title] [--intent]   Let uiotg pick the template for raw data
  uiotg gallery [--out dir] [--theme both|all|a,b] [--minimal]   Render every template's example (or its bare-minimum data)

Render options:
  --data <json | @file.json | ->   Template data (default: the template's example)
  --out <file>                     Output path (default: <template>.png)
  --width <px> --height <px> --scale <1-3> --padding <px>
  --theme <preset | saved name | JSON theme>   --format png|jpeg   --transparent   --accent <#hex>

Environment:
  UIOTG_THEME, UIOTG_SCALE, UIOTG_FORMAT   Default render options (a saved default theme wins over UIOTG_THEME)
  UIOTG_THEMES_DIR                         Where custom themes are saved (default ~/.config/uiotg/themes)
  UIOTG_OUTPUT_DIR                         Also save every MCP render here
  UIOTG_TOOLS=per-template                 Same as --tools per-template
  UIOTG_CHROMIUM_PATH                      Use a specific Chrome/Chromium binary
  UIOTG_OFFLINE=1                          Block all network (remote images)
  UIOTG_HTTP=1, PORT                       Same as --http / --port
  UIOTG_AUTH_TOKEN                         Require "Authorization: Bearer <token>" on /mcp
  UIOTG_PUBLIC_URL                         Public base URL; renders are also served at /images/<file>
  UIOTG_IMAGE_DIR, UIOTG_IMAGE_TTL_HOURS   Where served images live (default /tmp/uiotg-images, 24h)
`;

const { values: flags, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    data: { type: 'string', short: 'd' },
    out: { type: 'string', short: 'o' },
    width: { type: 'string' },
    height: { type: 'string' },
    scale: { type: 'string' },
    padding: { type: 'string' },
    theme: { type: 'string' },
    format: { type: 'string' },
    accent: { type: 'string' },
    transparent: { type: 'boolean' },
    tools: { type: 'string' },
    http: { type: 'boolean' },
    port: { type: 'string' },
    host: { type: 'string' },
    only: { type: 'string' },
    minimal: { type: 'boolean' },
    title: { type: 'string' },
    intent: { type: 'string' },
    detail: { type: 'string' },
    help: { type: 'boolean', short: 'h' },
    version: { type: 'boolean', short: 'v' },
  },
});

const [command = 'serve', arg] = positionals;

function renderOptions(): RenderOptions {
  const num = (v?: string) => (v == null ? undefined : Number(v));
  return {
    width: num(flags.width),
    height: num(flags.height),
    scale: num(flags.scale),
    padding: num(flags.padding),
    theme: flags.theme?.trim().startsWith('{') ? JSON.parse(flags.theme) : flags.theme,
    format: flags.format as RenderOptions['format'],
    accent: flags.accent,
    transparent: flags.transparent,
    detail: flags.detail as RenderOptions['detail'],
  };
}

async function readData(spec: string | undefined, fallback: unknown): Promise<unknown> {
  if (spec == null) return fallback;
  if (spec === '-') {
    const chunks: Buffer[] = [];
    for await (const c of process.stdin) chunks.push(c as Buffer);
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  }
  if (spec.startsWith('@')) return JSON.parse(await readFile(spec.slice(1), 'utf8'));
  return JSON.parse(spec);
}

async function serve(): Promise<void> {
  const renderer = createRenderer();
  const toolMode = (flags.tools ?? process.env.UIOTG_TOOLS) === 'per-template' ? 'per-template' : 'single';
  const shutdown = async () => {
    await renderer.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  if (flags.http || process.env.UIOTG_HTTP === '1') {
    const port = Number(flags.port ?? process.env.PORT ?? 8080);
    const host = flags.host ?? process.env.UIOTG_HOST ?? '0.0.0.0';
    const authToken = process.env.UIOTG_AUTH_TOKEN || undefined;
    const publicUrl = process.env.UIOTG_PUBLIC_URL || undefined;
    await startHttpServer({
      renderer,
      port,
      host,
      toolMode,
      authToken,
      publicUrl,
      imageDir: process.env.UIOTG_IMAGE_DIR || undefined,
      imageTtlHours: process.env.UIOTG_IMAGE_TTL_HOURS ? Number(process.env.UIOTG_IMAGE_TTL_HOURS) : undefined,
    });
    console.error(
      `uiotg ${VERSION} listening on http://${host}:${port}/mcp` +
        `${authToken ? ' (bearer auth on)' : ' (WARNING: no UIOTG_AUTH_TOKEN, open to anyone who can reach it)'}` +
        `${publicUrl ? `, images at ${publicUrl}/images/` : ''}`,
    );
    return;
  }

  const server = createServer({ renderer, toolMode });
  process.stdin.on('close', shutdown);
  await server.connect(new StdioServerTransport());
}

async function main(): Promise<void> {
  if (flags.version) return void console.log(VERSION);
  if (flags.help || command === 'help') return void console.log(HELP);
  if (command === 'serve') return serve();

  const renderer = createRenderer();
  const registry = renderer.registry;
  try {
    switch (command) {
      case 'list': {
        for (const [cat, label] of Object.entries(CATEGORIES)) {
          const ts = registry.list(cat as keyof typeof CATEGORIES);
          if (!ts.length) continue;
          console.log(`\n${label}`);
          for (const t of ts) console.log(`  ${t.id.padEnd(18)} ${t.title}`);
        }
        console.log();
        break;
      }
      case 'schema': {
        const t = arg && registry.get(arg);
        if (!t) throw new Error(`Usage: uiotg schema <template>. Templates: ${registry.ids().join(', ')}`);
        console.log(JSON.stringify({ id: t.id, description: t.description, schema: registry.jsonSchema(t.id), example: t.example }, null, 2));
        break;
      }
      case 'html':
      case 'render': {
        const t = arg && registry.get(arg);
        if (!t) throw new Error(`Usage: uiotg ${command} <template>. Templates: ${registry.ids().join(', ')}`);
        const data = await readData(flags.data, t.example);
        if (command === 'html') {
          const doc = await renderer.toHtml(t.id, data, renderOptions());
          const out = flags.out ?? `${t.id}.html`;
          await writeFile(out, doc.html);
          console.log(`Wrote ${resolve(out)}`);
        } else {
          const result = await renderer.render(t.id, data, renderOptions());
          const out = flags.out ?? `${t.id}.${result.mimeType === 'image/jpeg' ? 'jpg' : 'png'}`;
          await writeFile(out, result.data);
          console.log(`Wrote ${resolve(out)} (${result.width}×${result.height} @${result.scale}x)`);
        }
        break;
      }
      case 'visualize': {
        if (flags.data == null) throw new Error('Usage: uiotg visualize --data <json | @file.json | -> [--title …] [--intent trend|compare|share|relationship|summary]');
        // Plain text that isn't JSON is visualized as text.
        const raw = await readData(flags.data, undefined).catch(() => flags.data);
        const choice = chooseVisual({ data: raw, title: flags.title, intent: flags.intent as Intent | undefined }, registry);
        const result = await renderer.render(choice.template, choice.data, renderOptions());
        const out = flags.out ?? 'visualize.png';
        await writeFile(out, result.data);
        console.log(`Chose ${choice.template} (${result.detail}): ${choice.reason}\nWrote ${resolve(out)}`);
        break;
      }
      case 'gallery':
        await gallery(renderer);
        break;
      default:
        console.error(`Unknown command "${command}".\n`);
        console.log(HELP);
        process.exitCode = 1;
    }
  } finally {
    await renderer.close();
  }
}

async function gallery(renderer: ReturnType<typeof createRenderer>): Promise<void> {
  const out = resolve(flags.out ?? 'gallery');
  await mkdir(out, { recursive: true });
  // "both" (default): light and dark; "all": every preset; or a comma-separated list of theme names.
  const themes = !flags.theme || flags.theme === 'both' ? ['light', 'dark'] : flags.theme === 'all' ? Object.keys(PRESETS) : flags.theme.split(',');
  const only = flags.only ? new Set(flags.only.split(',')) : null;
  const templates = renderer.registry.list().filter((t) => !only || only.has(t.id));
  const entries: string[] = [];
  let failed = 0;
  await Promise.all(
    templates.flatMap((t) =>
      themes.map(async (theme) => {
        const started = performance.now();
        const file = `${t.id}-${theme}.png`;
        try {
          const data = flags.minimal ? minimalData(t, renderer.registry) : t.example;
          const r = await renderer.render(t.id, data, { ...renderOptions(), theme });
          await writeFile(join(out, file), r.data);
          console.log(`✓ ${file.padEnd(32)} ${r.width}×${r.height}  ${Math.round(performance.now() - started)} ms`);
          entries.push(`<figure class="${theme}"><img src="${file}" width="${r.width}"><figcaption>${t.id} · ${theme}</figcaption></figure>`);
        } catch (err) {
          failed++;
          console.error(`✗ ${file}: ${err instanceof TemplateDataError ? err.message : (err as Error).stack}`);
        }
      }),
    ),
  );
  entries.sort();
  await writeFile(
    join(out, 'index.html'),
    `<!doctype html><meta charset="utf-8"><title>uiotg gallery</title><style>body{font:14px system-ui;background:#e9e8e4;margin:24px}` +
      `main{display:flex;flex-wrap:wrap;gap:24px;align-items:flex-start}figure{margin:0}img{max-width:100%;height:auto;` +
      `box-shadow:0 2px 12px rgba(0,0,0,.12)}figcaption{margin-top:6px;color:#555}</style><main>${entries.join('')}</main>`,
  );
  console.log(`\nGallery: ${join(out, 'index.html')}${failed ? ` (${failed} failed)` : ''}`);
  if (failed) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err instanceof TemplateDataError ? err.message : err);
  process.exit(1);
});
