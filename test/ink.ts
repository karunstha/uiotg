import type { Renderer } from '../src/render/renderer.ts';

export interface Ink {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * Bounding box of everything painted in a rendered PNG, in image px: pixels that
 * differ from the top-left corner (the root's background). Decoded in the page.
 */
export async function inkBox(renderer: Renderer, png: Buffer, width: number, height: number): Promise<Ink | null> {
  return renderer.browser.withPage({ width, height, scale: 1, colorScheme: 'light' }, async (page) => {
    await page.setContent(`<img id="i" src="data:image/png;base64,${png.toString('base64')}">`);
    return page.evaluate(() => {
      const img = document.getElementById('i') as HTMLImageElement;
      const c = document.createElement('canvas');
      [c.width, c.height] = [img.naturalWidth, img.naturalHeight];
      const g = c.getContext('2d')!;
      g.drawImage(img, 0, 0);
      const px = g.getImageData(0, 0, c.width, c.height).data;
      const bg = [px[0]!, px[1]!, px[2]!];
      let [left, top, right, bottom] = [Infinity, Infinity, -Infinity, -Infinity];
      for (let y = 0; y < c.height; y++) {
        for (let x = 0; x < c.width; x++) {
          const i = (y * c.width + x) * 4;
          if (Math.abs(px[i]! - bg[0]!) + Math.abs(px[i + 1]! - bg[1]!) + Math.abs(px[i + 2]! - bg[2]!) < 24) continue;
          left = Math.min(left, x);
          right = Math.max(right, x + 1);
          top = Math.min(top, y);
          bottom = Math.max(bottom, y + 1);
        }
      }
      return left > right ? null : { left, top, right, bottom };
    });
  });
}

/**
 * How many pixels differ from the top-left corner (the root's background, outside
 * the circle) farther than `radius` + 1 from the image centre: ink a round screen
 * would cut off.
 */
export async function inkOutsideCircle(renderer: Renderer, png: Buffer, width: number, height: number, radius = Math.min(width, height) / 2): Promise<number> {
  return renderer.browser.withPage({ width, height, scale: 1, colorScheme: 'light' }, async (page) => {
    await page.setContent(`<img id="i" src="data:image/png;base64,${png.toString('base64')}">`);
    return page.evaluate((r) => {
      const img = document.getElementById('i') as HTMLImageElement;
      const c = document.createElement('canvas');
      [c.width, c.height] = [img.naturalWidth, img.naturalHeight];
      const g = c.getContext('2d')!;
      g.drawImage(img, 0, 0);
      const px = g.getImageData(0, 0, c.width, c.height).data;
      const bg = [px[0]!, px[1]!, px[2]!];
      let n = 0;
      for (let y = 0; y < c.height; y++) {
        for (let x = 0; x < c.width; x++) {
          if (Math.hypot(x + 0.5 - c.width / 2, y + 0.5 - c.height / 2) <= r + 1) continue;
          const i = (y * c.width + x) * 4;
          if (Math.abs(px[i]! - bg[0]!) + Math.abs(px[i + 1]! - bg[1]!) + Math.abs(px[i + 2]! - bg[2]!) >= 24) n++;
        }
      }
      return n;
    }, radius);
  });
}
