import { z } from 'zod';
import { colorSchema } from '../../core/format.ts';
import { measureText } from '../../core/measure.ts';
import { html, type Html } from '../../core/html.ts';
import type { RenderContext } from '../../core/types.ts';
import { header, headerHeight, legend, legendHeight, type LegendItem } from '../../core/ui.ts';

export const seriesSchema = z.object({
  name: z.string().min(1).max(80),
  values: z.array(z.number().nullable()).describe('One value per x/category; null for gaps'),
  color: colorSchema.optional().describe('Override the palette color for this series (use sparingly)'),
});

export type Series = z.infer<typeof seriesSchema>;

export const label = z.union([z.string(), z.number()]);

export const plotHeightSchema = z
  .number()
  .int()
  .min(120)
  .max(1600)
  .optional()
  .describe('Plot area height in px; defaults to roughly half the width');

export const MAX_SERIES_MESSAGE =
  'At most 8 series: fold the smallest into an "Other" series, or split into several charts';

/** Checks every series has exactly `n` values. */
export function checkLengths(series: Series[], n: number, what: string, ctx: z.RefinementCtx): void {
  series.forEach((s, i) => {
    if (s.values.length !== n)
      ctx.addIssue({
        code: 'custom',
        path: ['series', i, 'values'],
        message: `Series "${s.name}" has ${s.values.length} values but there are ${n} ${what}`,
      });
  });
}

/**
 * Plot size for a chart that sits under a header and legend. With a fixed
 * output height the plot takes what's left; otherwise it follows the data's
 * `height` or a width-based default.
 */
export function plotSize(
  ctx: RenderContext,
  d: { title?: string; subtitle?: string; height?: number },
  legendItems: LegendItem[] = [],
  aspect = 0.52,
  reserve = 0,
): { width: number; height: number } {
  const width = Math.max(120, ctx.width);
  if (ctx.height) {
    const reserved = headerHeight(d) + legendHeight(legendItems, width) + reserve;
    return { width, height: Math.max(100, ctx.height - reserved) };
  }
  return { width, height: d.height ?? Math.round(Math.min(520, Math.max(200, width * aspect))) };
}

/** Header + legend + plot, the standard chart layout. */
export function chartLayout(
  d: { title?: string; subtitle?: string },
  legendItems: LegendItem[] | null,
  plot: Html,
  extra?: { aside?: Html | null; above?: Html | null; below?: Html | null },
): Html {
  return html`<div class="chart">
    ${header(d, extra?.aside)}
    ${legendItems && legendItems.length ? legend(legendItems) : null}
    ${extra?.above ?? null}
    <div class="plot">${plot}</div>
    ${extra?.below ?? null}
  </div>`;
}

/** Legend entries: a legend is always shown for 2+ series and never for one (the title names it). */
export function seriesLegend(names: string[], colors: string[], shape: LegendItem['shape'] = 'square'): LegendItem[] {
  if (names.length < 2) return [];
  return names.map((name, i) => ({ name, color: colors[i]!, shape }));
}

export function maxAbs(values: Array<number | null | undefined>): number {
  let m = 0;
  for (const v of values) if (v != null && Number.isFinite(v)) m = Math.max(m, Math.abs(v));
  return m;
}

/** Label width in px for Inter at `size`. */
export function textWidth(text: string, size = 12, bold = false): number {
  return measureText(text, size, bold);
}

export const axisLabelFields = {
  x_label: z.string().max(80).optional().describe('Title for the horizontal axis'),
  y_label: z.string().max(80).optional().describe('Title for the vertical axis'),
};

/** Axis titles as HTML (never rotated text), plus the height they take. */
export function axisTitles(d: { x_label?: string; y_label?: string }): { above: Html | null; below: Html | null; reserve: number } {
  return {
    above: d.y_label ? html`<div class="axis-title y">${d.y_label}</div>` : null,
    below: d.x_label ? html`<div class="axis-title x">${d.x_label}</div>` : null,
    reserve: (d.y_label ? 24 : 0) + (d.x_label ? 26 : 0),
  };
}

/** Grid that keeps axis labels inside the plot box. */
export function grid(pad: { top?: number; right?: number; bottom?: number; left?: number } = {}): Record<string, unknown> {
  return {
    top: pad.top ?? 8,
    right: pad.right ?? 8,
    bottom: pad.bottom ?? 0,
    left: pad.left ?? 0,
    outerBoundsMode: 'same',
    outerBoundsContain: 'axisLabel',
  };
}
