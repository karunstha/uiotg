/**
 * Render options that don't depend on themes. The renderer's option schema and
 * a theme's `defaults` both build on these, so the limits live in one place
 * (themes.ts can't import the renderer, which imports themes).
 */
import { z } from 'zod';

const paddingPx = z.number().int().min(0).max(160);

export const sizeOptionsSchema = z.object({
  width: z.number().int().min(160).max(2400).optional().describe('Image width in CSS px; defaults to the template’s preferred width'),
  height: z.number().int().min(80).max(4000).optional().describe('Fixed image height in CSS px; omit to fit the content'),
  scale: z.number().min(1).max(3).optional().describe('Device pixel ratio; 2 (default) gives crisp images'),
  format: z.enum(['png', 'jpeg']).optional().describe('Image format (default png)'),
  quality: z.number().int().min(1).max(100).optional().describe('JPEG quality (default 90)'),
  padding: z
    .union([paddingPx, z.object({ x: paddingPx.describe('Left and right padding in CSS px'), y: paddingPx.describe('Top and bottom padding in CSS px') }).strict()])
    .optional()
    .describe('Outer padding in CSS px: one number for all sides, or {"x":…,"y":…} for left/right and top/bottom'),
  detail: z
    .enum(['auto', 'minimal', 'standard', 'rich'])
    .optional()
    .describe('Level of detail. "auto" (default) picks from the data and image size: minimal when small, rich (summary stats, extremes) when there is room and enough data'),
  overflow: z
    .enum(['grow', 'cap'])
    .optional()
    .describe(
      'What happens when the content is taller than a fixed height. "grow" (default): the image grows to show everything. ' +
        '"cap": the image keeps the exact size and list-like templates show fewer items plus a "+N more" line (templates without that fall back to grow). Only matters when a height is set',
    ),
  shape: z
    .enum(['rect', 'circle'])
    .optional()
    .describe(
      'Shape of the visible screen. "rect" (default): the whole image shows. "circle": a round screen whose diameter is the smaller of width and height ' +
        '(height defaults to the width), centred; corners are cut off, so lists and key/value rows centre and narrow to fit the circle and other templates ' +
        'keep to the square inside it. padding adds to that inset',
    ),
});

export type SizeOptions = z.input<typeof sizeOptionsSchema>;

export type Padding = NonNullable<SizeOptions['padding']>;

export type Shape = NonNullable<SizeOptions['shape']>;

/** A padding option as per-axis pixels (a number means both axes). */
export function paddingXY(padding: Padding): { x: number; y: number } {
  return typeof padding === 'number' ? { x: padding, y: padding } : padding;
}
