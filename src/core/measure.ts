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
