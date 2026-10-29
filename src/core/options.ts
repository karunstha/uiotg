/**
 * Render options that don't depend on themes. The renderer's option schema and
 * a theme's `defaults` both build on these, so the limits live in one place
 * (themes.ts can't import the renderer, which imports themes).
 */
import { z } from 'zod';

export const sizeOptionsSchema = z.object({
  width: z.number().int().min(160).max(2400).optional().describe('Image width in CSS px; defaults to the template’s preferred width'),
  height: z.number().int().min(80).max(4000).optional().describe('Fixed image height in CSS px; omit to fit the content'),
  scale: z.number().min(1).max(3).optional().describe('Device pixel ratio; 2 (default) gives crisp images'),
  format: z.enum(['png', 'jpeg']).optional().describe('Image format (default png)'),
  quality: z.number().int().min(1).max(100).optional().describe('JPEG quality (default 90)'),
  padding: z.number().int().min(0).max(160).optional().describe('Outer padding in CSS px'),
  detail: z
    .enum(['auto', 'minimal', 'standard', 'rich'])
    .optional()
    .describe('Level of detail. "auto" (default) picks from the data and image size: minimal when small, rich (summary stats, extremes) when there is room and enough data'),
});

export type SizeOptions = z.input<typeof sizeOptionsSchema>;
