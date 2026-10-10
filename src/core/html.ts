/**
 * A string of markup that is already safe to embed. Everything interpolated
 * into `html` is escaped unless it is an `Html` instance.
 */
export class Html {
  readonly value: string;
  constructor(value: string) {
    this.value = value;
  }
  toString(): string {
    return this.value;
  }
}

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(value: unknown): string {
  return String(value).replace(/[&<>"']/g, (c) => ESCAPES[c]!);
}

/** Numbers as displayed: "1,234", "$4.2M", "−12.5%", "23°", "4:05", "212 ms". */
const NUMBER_TEXT = /^[+−-]?[$€£¥]?\d[\d,.:]*\s?(%|[A-Za-z°]{1,3})?$/;

function interpolate(value: unknown, inText = true): string {
  // null/undefined/booleans render nothing so `cond && html`...`` works inline.
  if (value == null || typeof value === 'boolean') return '';
  if (value instanceof Html) return value.value;
  if (Array.isArray(value)) return value.map((v) => interpolate(v, inText)).join('');
  const text = escapeHtml(value);
  // Numbers in page text never break across lines; layouts make room for them instead.
  if (inText && NUMBER_TEXT.test(String(value).trim())) return `<span class="nw">${text}</span>`;
  return text;
}

/** True when a template chunk ends inside an attribute value or tag (so the next value isn't page text). */
function inAttribute(chunk: string): boolean {
  return /=\s*"[^"]*$/.test(chunk) || /<[^>]*$/.test(chunk);
}

/** Tagged template that escapes interpolations. */
export function html(strings: TemplateStringsArray, ...values: unknown[]): Html {
  let out = strings[0]!;
  for (let i = 0; i < values.length; i++) out += interpolate(values[i], !inAttribute(out)) + strings[i + 1];
  return new Html(out);
}

/** Marks trusted markup (generated SVG, highlighter output) as safe. */
export function raw(markup: string): Html {
  return new Html(markup);
}

/** Builds an inline style string, skipping empty values. Values are escaped by `html`. */
export function style(props: Record<string, string | number | null | undefined | false>): string {
  return Object.entries(props)
    .filter(([, v]) => v != null && v !== false && v !== '')
    .map(([k, v]) => `${k}:${typeof v === 'number' && !UNITLESS.has(k) ? `${v}px` : v}`)
    .join(';');
}

const UNITLESS = new Set(['opacity', 'flex', 'flex-grow', 'flex-shrink', 'z-index', 'font-weight', 'line-height', 'order']);

/** Joins class names, dropping falsy entries. */
export function cx(...names: Array<string | false | null | undefined>): string {
  return names.filter(Boolean).join(' ');
}
