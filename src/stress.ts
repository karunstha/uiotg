import type { Template } from './core/types.ts';
import type { Registry } from './registry.ts';

/** Identifiers and raw configs: changing these changes meaning, not text. */
const SKIP_KEYS = new Set(['template', 'option', 'language', 'code_theme', 'timezone', 'month', 'format', 'x_format', 'y_format', 'delta_format']);

/**
 * Builds a worst-case variant of a template's example for overflow testing:
 * every string gets longer (including an unbreakable token) and numbers get
 * bigger, keeping only the changes that still validate against the schema.
 */
const STRING_VARIANTS = [
  (s: string) => `${s} with a considerably longer label that keeps going Pneumonoultramicroscopicsilicovolcanoconiosis`,
  (s: string) => `${s} Pneumonoultramicroscopicsilicovolcanoconiosis`,
  (s: string) => `${s} — longer label text`,
  (s: string) => `${s}${s}`,
];
const NUMBER_VARIANTS = [(n: number) => n * 1_000_003 + 0.5, (n: number) => n * 1003, (n: number) => n * 13];

export function stressData(t: Template, registry?: Registry, maxNumbers = 60): unknown {
  const doc = structuredClone(t.example) as unknown;
  // Layout blocks must also stay valid for the template each block renders.
  const blocksValid = () => {
    const blocks = (doc as { blocks?: Array<{ template: string; data: unknown }> }).blocks;
    return !registry || !blocks || blocks.every((b) => registry.get(b.template)?.schema.safeParse(b.data).success);
  };
  const valid = () => t.schema.safeParse(doc).success && blocksValid();
  let numbers = 0;

  const visit = (node: unknown, set: (v: unknown) => void, get: () => unknown, depth: number): void => {
    if (depth > 8) return;
    if (typeof node === 'string') {
      for (const variant of STRING_VARIANTS) {
        set(variant(node));
        if (valid()) return;
      }
      set(node);
      return;
    }
    if (typeof node === 'number') {
      if (numbers++ >= maxNumbers) return;
      for (const variant of NUMBER_VARIANTS) {
        set(variant(node));
        if (valid()) return;
      }
      set(node);
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((child, i) => visit(child, (v) => (node[i] = v), () => node[i], depth + 1));
      return;
    }
    if (node && typeof node === 'object') {
      const obj = node as Record<string, unknown>;
      for (const key of Object.keys(obj)) if (!SKIP_KEYS.has(key)) visit(obj[key], (v) => (obj[key] = v), () => obj[key], depth + 1);
    }
    void get;
  };
  visit(doc, () => {}, () => doc, 0);
  return doc;
}
