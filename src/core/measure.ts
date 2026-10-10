import { INTER_REGULAR, INTER_SEMIBOLD } from './metrics.ts';

/** Width in px of `text` set in Inter at `size`, from the measured advance widths. */
export function measureText(text: string, size = 12, bold = false): number {
  const table = bold ? INTER_SEMIBOLD : INTER_REGULAR;
  let em = 0;
  for (const ch of text ?? '') {
    const code = ch.charCodeAt(0);
    em += code >= 32 && code < 127 ? table[code - 32]! : code > 0x2e80 ? 1 : 0.6;
  }
  return em * size;
}

/**
 * Largest font size (≤ `base`, ≥ `min`) at which `text` fits in `maxWidth`.
 * Used for big numbers, which must stay on one line and never be cut off.
 */
export function fitFontSize(text: string, maxWidth: number, base: number, min = 12, bold = true): number {
  const atOne = measureText(text, 1, bold) * 1.04;
  if (atOne <= 0) return base;
  return Math.max(min, Math.min(base, Math.floor(maxWidth / atOne)));
}

/**
 * Wraps text into lines no wider than `maxWidth` using Inter metrics; words
 * longer than a line are split. Used where a renderer (e.g. some ECharts
 * labels) can't wrap on its own.
 */
export function wrapText(text: string, maxWidth: number, size = 12, bold = false): string[] {
  const lines: string[] = [];
  let line = '';
  const push = (word: string) => {
    const candidate = line ? `${line} ${word}` : word;
    if (measureText(candidate, size, bold) <= maxWidth) {
      line = candidate;
      return;
    }
    if (line) lines.push(line);
    line = '';
    // Split words that can't fit on a line by themselves.
    let chunk = '';
    for (const ch of word) {
      if (measureText(chunk + ch, size, bold) > maxWidth && chunk) {
        lines.push(chunk);
        chunk = '';
      }
      chunk += ch;
    }
    line = chunk;
  };
  for (const word of text.split(/\s+/).filter(Boolean)) push(word);
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}
