import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { CATEGORIES, type Category, type Template } from './core/types.ts';
import { renderOptionsSchema, TemplateDataError, type RenderOptions, type Renderer } from './render/renderer.ts';
import { chooseVisual, intentSchema } from './auto.ts';

export const VERSION: string = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;

export interface ServerOptions {
  renderer: Renderer;
  /**
   * "single" exposes one generic `render` tool (default). "per-template" also
   * exposes a `render_<id>` tool per template with its exact input schema.
   */
  toolMode?: 'single' | 'per-template';
  /** When set, every image is also written here and its path returned. Env: UIOTG_OUTPUT_DIR. */
  outputDir?: string;
  /** When set (with outputDir), results include `<imageBaseUrl>/<file>` so clients can link or forward the image. */
  imageBaseUrl?: string;
}

const INSTRUCTIONS = `uiotg (User Interface On The Go) turns structured data into polished UI images: charts, tables, stat tiles, cards, album art, dashboards and more.

Fastest path: call \`visualize\` with the raw data you have (a number, text, a list, an object or rows) plus an optional title and intent. uiotg picks the template and the level of detail and tells you what it chose.

Full control: choose a template from the \`render\` tool description (or \`list_templates\`), call \`get_template\` for its schema and an example, then call \`render\` with { template, data }. Invalid data returns the problems plus an example so you can fix it and retry.

Tips: prefer a stat tile over a one-bar chart; keep categorical series to 8 or fewer (fold the rest into "Other"); use \`dashboard\` to combine several templates in one image; pass options.theme "dark" for dark mode.`;

function size(t: Template): string {
  const w = typeof t.width === 'number' ? `${t.width}px` : 'auto';
  return t.height ? `${w} × ${t.height}px` : `${w} wide`;
}

function catalog(templates: Template[]): string {
  const groups = new Map<Category, Template[]>();
  for (const t of templates) groups.set(t.category, [...(groups.get(t.category) ?? []), t]);
  return [...groups]
    .map(([cat, ts]) => `${CATEGORIES[cat]}:\n${ts.map((t) => `- ${t.id}: ${t.description}`).join('\n')}`)
    .join('\n\n');
}

function errorResult(text: string): CallToolResult {
  return { isError: true, content: [{ type: 'text', text }] };
}

export function createServer(opts: ServerOptions): McpServer {
  const { renderer } = opts;
  const registry = renderer.registry;
  const outputDir = opts.outputDir ?? (process.env.UIOTG_OUTPUT_DIR || undefined);
  const templates = registry.list();
  const ids = registry.ids() as [string, ...string[]];

  const server = new McpServer({ name: 'uiotg', title: 'uiotg — UI on the go', version: VERSION }, { instructions: INSTRUCTIONS });

  const describe = (t: Template) => ({
    id: t.id,
    title: t.title,
    category: t.category,
    description: t.description,
    default_size: size(t),
    data_schema: registry.jsonSchema(t.id),
    example: t.example,
  });

  async function run(templateId: string, data: unknown, options: RenderOptions | undefined, note?: string): Promise<CallToolResult> {
    try {
      const result = await renderer.render(templateId, data, options ?? {});
      const kb = (result.data.length / 1024).toFixed(0);
      const lines = [
        ...(note ? [note] : []),
        `Rendered ${templateId} (${result.detail} detail): ${result.width}×${result.height} CSS px at ${result.scale}x (${result.mimeType}, ${kb} KB).`,
      ];
      if (outputDir) {
        const dir = resolve(outputDir);
        await mkdir(dir, { recursive: true });
        const ext = result.mimeType === 'image/jpeg' ? 'jpg' : 'png';
        // 96 random bits: served image URLs are unguessable.
        const name = `${templateId}-${randomBytes(12).toString('hex')}.${ext}`;
        await writeFile(join(dir, name), result.data);
        if (opts.imageBaseUrl) lines.push(`URL: ${opts.imageBaseUrl}/${name}`);
        else lines.push(`Saved to ${join(dir, name)}`);
      }
      return {
        content: [
          { type: 'image', data: result.data.toString('base64'), mimeType: result.mimeType },
          { type: 'text', text: lines.join('\n') },
        ],
      };
    } catch (err) {
      if (err instanceof TemplateDataError) {
        const t = registry.get(err.template);
        return errorResult(
          `${err.message}\n\nFix the data and call again. Example of valid data for "${err.template}":\n` +
            JSON.stringify(t?.example ?? {}, null, 2) +
            `\n\nCall get_template("${err.template}") for the full JSON schema.`,
        );
      }
      return errorResult((err as Error).message);
    }
  }

  server.registerTool(
    'visualize',
    {
      title: 'Visualize data',
      description:
        'Turn raw data into the right UI image automatically. Send what you have: a number, text, a list, an object, or rows ' +
        '(array of objects, e.g. query results). uiotg infers the shape (time series → line chart, ranked categories → bars, ' +
        'parts of a whole → donut, a few numbers → stat tiles, a record → key/value list, mixed rows → table, two measures → scatter) ' +
        'and the level of detail, renders it, and reports which template it used. Use render instead to pick a template yourself.',
      inputSchema: {
        data: z.unknown().describe('Raw data: number, string, array, object or array of row objects'),
        title: z.string().max(200).optional(),
        subtitle: z.string().max(400).optional(),
        intent: intentSchema.optional(),
        options: renderOptionsSchema.optional(),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ data, title, subtitle, intent, options }) => {
      let choice;
      try {
        choice = chooseVisual({ data, title, subtitle, intent }, registry);
      } catch (err) {
        return errorResult((err as Error).message);
      }
      const json = JSON.stringify(choice.data);
      const note =
        `Chose ${choice.template}: ${choice.reason}.` +
        (json.length <= 1500 ? `\nTo adjust, call render with template "${choice.template}" and this data: ${json}` : `\nTo adjust, call render with template "${choice.template}".`);
      return run(choice.template, choice.data, options, note);
    },
  );

  server.registerTool(
    'list_templates',
    {
      title: 'List templates',
      description: 'Lists the available UI templates with what each is for. Optionally filter by category.',
      inputSchema: { category: z.enum(Object.keys(CATEGORIES) as [Category, ...Category[]]).optional() },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ category }) => {
      const list = registry.list(category);
      const text = list.map((t) => `- ${t.id} (${t.category}, ${size(t)}): ${t.description}`).join('\n');
      return { content: [{ type: 'text', text: text || 'No templates in that category.' }] };
    },
  );

  server.registerTool(
    'get_template',
    {
      title: 'Get template schema',
      description: 'Returns a template’s description, default size, JSON Schema for its `data`, and a complete example.',
      inputSchema: { template: z.enum(ids).describe('Template id') },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ template }) => {
      const t = registry.get(template);
      if (!t) return errorResult(`Unknown template "${template}". Available: ${ids.join(', ')}`);
      return { content: [{ type: 'text', text: JSON.stringify(describe(t), null, 2) }] };
    },
  );

  server.registerTool(
    'render',
    {
      title: 'Render UI image',
      description:
        `Render data into a UI image using a template. Returns the image.\n\nTemplates:\n${catalog(templates)}\n\n` +
        'Call get_template for a template’s exact data schema and example.',
      inputSchema: {
        template: z.enum(ids).describe('Template id from the catalog'),
        data: z.record(z.string(), z.unknown()).describe('Template data, matching the template’s schema (see get_template)'),
        options: renderOptionsSchema.optional(),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ template, data, options }) => run(template, data, options),
  );

  if (opts.toolMode === 'per-template') {
    for (const t of templates) {
      server.registerTool(
        `render_${t.id}`,
        {
          title: `Render ${t.title}`,
          description: `${t.description} Returns an image (default ${size(t)}).`,
          inputSchema: { data: t.schema, options: renderOptionsSchema.optional() },
          annotations: { readOnlyHint: true, openWorldHint: true },
        },
        async ({ data, options }) => run(t.id, data, options),
      );
    }
  }

  return server;
}
