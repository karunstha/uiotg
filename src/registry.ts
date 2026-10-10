import { z } from 'zod';
import { photoSchema, QUERY_FIELD } from './core/backdrop.ts';
import type { Category, Template } from './core/types.ts';

export class Registry {
  readonly #templates = new Map<string, Template>();

  constructor(templates: Iterable<Template> = []) {
    for (const t of templates) this.register(t);
  }

  register(template: Template): this {
    if (!/^[a-z][a-z0-9_]*$/.test(template.id)) throw new Error(`Invalid template id "${template.id}" (use snake_case)`);
    if (this.#templates.has(template.id)) throw new Error(`Template "${template.id}" is already registered`);
    this.#templates.set(template.id, template);
    return this;
  }

  get(id: string): Template | undefined {
    return this.#templates.get(id);
  }

  has(id: string): boolean {
    return this.#templates.has(id);
  }

  ids(): string[] {
    return [...this.#templates.keys()];
  }

  list(category?: Category): Template[] {
    const all = [...this.#templates.values()];
    return category ? all.filter((t) => t.category === category) : all;
  }

  /** JSON Schema for a template's `data`, as a calling model should send it. */
  jsonSchema(id: string): Record<string, unknown> {
    const t = this.get(id);
    if (!t) throw new Error(`Unknown template "${id}"`);
    const schema = z.toJSONSchema(t.schema, { io: 'input', unrepresentable: 'any' }) as Record<string, unknown>;
    delete schema.$schema;
    if (t.photo && schema.properties) {
      const extra = z.toJSONSchema(photoSchema, { io: 'input' }) as { properties: Record<string, { description?: string }> };
      if (t.photo === 'title') extra.properties[QUERY_FIELD]!.description += '; defaults to the title';
      Object.assign(schema.properties as object, extra.properties);
    }
    return schema;
  }
}
