import { z } from 'zod';
import { festiveArt, occasionArt, type OccasionTheme } from '../../core/art.ts';
import { backdrop, backgroundFields } from '../../core/backdrop.ts';
import { colorSchema, iconSchema } from '../../core/format.ts';
import { html, style } from '../../core/html.ts';
import { icon } from '../../core/icons.ts';
import { fitFontSize } from '../../core/measure.ts';
import { hashHue, parseHex } from '../../core/theme.ts';
import { defineTemplate } from '../../core/types.ts';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** The few occasions with their own design, greeting and photo search. */
const BUILT_IN: Record<OccasionTheme, { match: RegExp; icon: string; query: string }> = {
  birthday: { match: /birth|bday/i, icon: 'cake', query: 'birthday party balloons' },
  anniversary: { match: /anniversary/i, icon: 'gem', query: 'anniversary champagne' },
  wedding: { match: /wedding|marriage|engage/i, icon: 'heart', query: 'wedding flowers' },
};

const GREETING = /^(happy|merry|congrat|thank|welcome|good luck|best wishes|eid mubarak|season|cheers|bon voyage|get well)/i;
/** Hues that make good festive backgrounds; muddy yellow-greens are left out. */
const NICE_HUES = [0, 16, 28, 160, 190, 215, 235, 262, 285, 320, 340];
const NAMED_HUES: Record<string, number> = { red: 0, orange: 28, gold: 45, yellow: 50, green: 140, teal: 175, blue: 215, navy: 225, purple: 275, pink: 330 };

function ordinal(n: number): string {
  const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th';
  return `${n}${s}`;
}

/** Hue of a CSS color (hex, hsl() or a basic name); null when it can't tell. */
function hueOf(color: string): number | null {
  const hsl = /^hsla?\(\s*([\d.]+)/i.exec(color);
  if (hsl) return Number(hsl[1]) % 360;
  if (color.toLowerCase() in NAMED_HUES) return NAMED_HUES[color.toLowerCase()]!;
  const rgb = parseHex(color);
  if (!rgb) return null;
  const [r, g, b] = rgb.map((v) => v / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  if (!d) return null;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return Math.round((h * 60 + 360) % 360);
}

/** "christmas" → "Christmas"; text the caller already cased is left alone. */
function titleCase(s: string): string {
  return s === s.toLowerCase() ? s.replace(/(^|[\s-])(\p{L})/gu, (_, sep: string, c: string) => sep + c.toUpperCase()) : s;
}

function defaultTitle(occasion: string, theme: OccasionTheme | null, d: { name?: string; age?: number }): string {
  const who = d.name ? `, ${d.name}` : '';
  if (theme === 'birthday') return d.age ? `Happy ${ordinal(d.age)} Birthday${who}!` : `Happy Birthday${who}!`;
  if (theme === 'anniversary') return d.age ? `Happy ${ordinal(d.age)} Anniversary${who}!` : `Happy Anniversary${who}!`;
  if (theme === 'wedding') return `Congratulations${who}!`;
  const text = titleCase(occasion.trim());
  return GREETING.test(text) ? `${text}${who}` : `Happy ${text}${who}`;
}

export const occasion = defineTemplate({
  id: 'occasion',
  title: 'Occasion card',
  category: 'media',
  description:
    'A festive greeting card for any occasion: a birthday (with age), anniversary, wedding, holiday (Christmas, Diwali, Eid, Lunar New Year…) or anything else (retirement, graduation, a launch). Pass the occasion by name; the background is a matching photo when a photo API key is set, otherwise themed art.',
  schema: z.object({
    occasion: z.string().min(1).max(60).describe('What is being celebrated, in plain words: "birthday", "Christmas", "Diwali", "retirement"… Also the photo search term'),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    name: z.string().max(60).optional().describe('Who it’s for'),
    age: z.number().int().min(1).max(150).optional().describe('Birthday age or anniversary years'),
    title: z.string().max(120).optional().describe('Overrides the default greeting ("Happy <occasion>", or "Merry Christmas" if you prefer)'),
    message: z.string().max(400).optional(),
    from: z.string().max(80).optional().describe('Signed by'),
    icon: iconSchema.optional().describe('Badge icon, e.g. "tree-pine" or "🎄"; defaults to one for the occasion'),
    color: colorSchema.optional().describe('Theme color for the art background, e.g. "#c0392b" for Christmas red'),
    ...backgroundFields,
  }),
  example: { occasion: 'birthday', name: 'Sam', age: 30, message: 'Wishing you a year full of good coffee, great code and long weekends.', from: 'The platform team' },
  width: 680,
  padding: 0,
  css: /* css */ `
.oc{min-height:380px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:44px 40px}
.oc-badge{width:56px;height:56px;border-radius:50%;display:flex;align-items:center;justify-content:center;margin-bottom:16px;
  background:rgba(255,255,255,.18);backdrop-filter:blur(6px);box-shadow:inset 0 0 0 1px rgba(255,255,255,.35)}
.oc-date{font-size:13px;font-weight:650;letter-spacing:.14em;text-transform:uppercase;opacity:.85;margin-bottom:8px}
.oc-title{font-weight:800;letter-spacing:-0.03em;line-height:1.05;text-wrap:balance;text-shadow:0 2px 18px rgba(0,0,0,.25)}
.oc-msg{font-size:17px;line-height:1.5;max-width:520px;margin-top:14px;opacity:.95;text-wrap:pretty;text-shadow:0 1px 10px rgba(0,0,0,.2)}
.oc-from{font-size:14px;font-weight:600;margin-top:18px;opacity:.85}
`,
  async render(d, ctx) {
    const theme = (Object.keys(BUILT_IN) as OccasionTheme[]).find((k) => BUILT_IN[k].match.test(d.occasion)) ?? null;
    const title = d.title ?? defaultTitle(d.occasion, theme, d);
    const [w, h] = [Math.round(ctx.width), 380];
    const bg = await backdrop({
      mode: d.background,
      url: d.background_url,
      query: theme ? BUILT_IN[theme].query : d.occasion,
      art: () =>
        theme && !d.color
          ? occasionArt(theme, w, h, `${title}${d.name ?? ''}`)
          : festiveArt((d.color ? hueOf(d.color) : null) ?? NICE_HUES[hashHue(d.occasion.toLowerCase()) % NICE_HUES.length]!, w, h, `${title}${d.name ?? ''}`),
    });
    const ink = bg?.ink ?? 'var(--text)';
    const dateLine = d.date ? (() => {
      const [, m, day] = d.date.split('-').map(Number) as [number, number, number];
      return `${MONTHS[m - 1]} ${day}`;
    })() : null;
    return html`<div class="${`oc${bg ? ' on-bk' : ''}`}" style="${style({ color: ink })}">
      ${bg?.layer ?? null}
      <span class="oc-badge">${icon(d.icon ?? (theme ? BUILT_IN[theme].icon : 'sparkles'), { size: 26 })}</span>
      ${dateLine ? html`<div class="oc-date">${dateLine}</div>` : null}
      <div class="oc-title" style="${`font-size:${fitFontSize(title.length > 28 ? title.slice(0, Math.ceil(title.length / 2)) : title, ctx.width - 80, 52, 26)}px`}">${title}</div>
      ${d.message ? html`<div class="oc-msg">${d.message}</div>` : null}
      ${d.from ? html`<div class="oc-from">— ${d.from}</div>` : null}
    </div>`;
  },
});
