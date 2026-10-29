/**
 * Helpers for Template.truncate (overflow "cap"): cut an item array to its
 * first `keep` entries and remember how many were dropped, so the template can
 * draw a "+N more" marker. The count rides on a symbol, so it never shows up
 * in schemas and validation can't strip it (truncate runs after validation).
 */
const HIDDEN = Symbol('hidden');

export interface Cut<D> {
  data: D;
  total: number;
  shown: number;
}

/** `obj` with `n` items noted as cut. */
export function withHidden<T extends object>(obj: T, n: number): T {
  return n > 0 ? ({ ...obj, [HIDDEN]: n } as T) : obj;
}

/** How many items truncate cut from `obj` (0 when none). */
export function hiddenCount(obj: object): number {
  return (obj as { [HIDDEN]?: number })[HIDDEN] ?? 0;
}

/** Keeps the first `keep` (at least one) entries of `data[key]`. */
export function keepFirst<D extends object, K extends keyof D>(data: D, key: K, keep: number): Cut<D> {
  const items = data[key] as unknown[];
  const shown = Math.min(items.length, Math.max(1, Math.floor(keep)));
  return { data: withHidden({ ...data, [key]: items.slice(0, shown) }, items.length - shown), total: items.length, shown };
}

/** The marker text: short and the same in every template. */
export function moreLabel(n: number): string {
  return `+${n} more`;
}
