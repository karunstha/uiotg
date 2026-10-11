import { z } from 'zod';
import { makeFormatter, titleFields } from '../../core/format.ts';
import { html, raw, style, type Html } from '../../core/html.ts';
import { fitFontSize } from '../../core/measure.ts';
import type { Theme } from '../../core/theme.ts';
import { defineTemplate } from '../../core/types.ts';
import { fitColumns, header } from '../../core/ui.ts';

const currency = z.string().length(3).default('USD').describe('ISO 4217 code');

let gradientId = 0;

/** Area chart of a price series, colored by direction, with an optional previous-close guide. */
export function priceChart(values: number[], opts: { width: number; height: number; color: string; theme: Theme; baseline?: number; fill?: boolean }): Html {
  const { width: w, height: h } = opts;
  const pad = 3;
  const all = opts.baseline != null ? [...values, opts.baseline] : values;
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  const span = hi - lo || 1;
  const x = (i: number) => pad + (i / Math.max(1, values.length - 1)) * (w - pad * 2);
  const y = (v: number) => pad + (1 - (v - lo) / span) * (h - pad * 2);
  const line = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join('');
  const id = `pc${++gradientId}`;
  let svg = `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true">`;
  if (opts.fill !== false) {
    svg += `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${opts.color}" stop-opacity="0.22"/><stop offset="1" stop-color="${opts.color}" stop-opacity="0"/></linearGradient></defs>`;
    svg += `<path d="${line}L${x(values.length - 1).toFixed(1)} ${h}L${x(0).toFixed(1)} ${h}Z" fill="url(#${id})"/>`;
  }
  if (opts.baseline != null) {
    svg += `<line x1="0" x2="${w}" y1="${y(opts.baseline).toFixed(1)}" y2="${y(opts.baseline).toFixed(1)}" stroke="${opts.theme.muted}" stroke-width="1" stroke-dasharray="3 4"/>`;
  }
  svg += `<path d="${line}" fill="none" stroke="${opts.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
  svg += '</svg>';
  return raw(svg);
}

export const stockQuote = defineTemplate({
  id: 'stock_quote',
  title: 'Stock quote',
  summary: 'one ticker with price chart',
  category: 'data',
  photo: 'keyword',
  description:
    'A ticker card: symbol and name, big price, change in value and percent (green up, red down), a price chart for the period against the previous close, market status and key stats (open, high, low, volume, market cap…). Works for stocks, ETFs, crypto and FX.',
  schema: z.object({
    symbol: z.string().min(1).max(16),
    name: z.string().max(80).optional(),
    exchange: z.string().max(20).optional(),
    currency,
    price: z.number(),
    change: z.number().optional().describe('Absolute change; computed from previous_close when omitted'),
    change_percent: z.number().optional().describe('Percent change, e.g. 1.25 for +1.25%'),
    previous_close: z.number().optional(),
    prices: z.array(z.number()).min(2).max(2000).optional().describe('Price series for the period, oldest first'),
    period: z.string().max(12).optional().describe('e.g. "1D", "5D", "1M", "YTD"'),
    market: z.enum(['open', 'closed', 'pre', 'after']).optional(),
    as_of: z.string().max(40).optional().describe('e.g. "Oct 9, 4:00 PM ET"'),
    stats: z
      .array(z.object({ label: z.string().max(30), value: z.union([z.string().max(30), z.number()]) }))
      .max(12)
      .optional()
      .describe('e.g. Open, High, Low, Volume, Mkt cap, P/E'),
  }),
  example: {
    symbol: 'ACME',
    name: 'Acme Corporation',
    exchange: 'NASDAQ',
    currency: 'USD',
    price: 199.1,
    previous_close: 195.3,
    period: '1D',
    market: 'closed',
    as_of: 'Oct 9, 4:00 PM ET',
    prices: [195.3, 195.9, 196.4, 195.8, 196.9, 197.6, 197.1, 197.9, 198.6, 198.2, 197.4, 198.1, 198.8, 199.4, 198.9, 199.1],
    stats: [
      { label: 'Open', value: 195.6 },
      { label: 'High', value: 199.7 },
      { label: 'Low', value: 195.1 },
      { label: 'Volume', value: '45.9M' },
      { label: 'Mkt cap', value: '3.1T' },
      { label: 'P/E', value: 31.4 },
    ],
  },
  width: 600,
  css: /* css */ `
.sq-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}
.sq-sym{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}
.sq-sym b{font-size:20px;font-weight:700;letter-spacing:-0.01em;color:var(--text)}
.sq-ex{font-size:12px;font-weight:600;color:var(--muted)}
.sq-name{font-size:14px;color:var(--text-2);margin-top:2px}
.sq-mkt{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:600;color:var(--text-2);white-space:nowrap}
.sq-mkt i{width:7px;height:7px;border-radius:50%;display:inline-block}
.sq-price{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap;margin-top:14px}
.sq-p{font-weight:700;letter-spacing:-0.03em;color:var(--text);line-height:1.05}
.sq-ch{font-size:16px;font-weight:650;white-space:nowrap}
.sq-asof{font-size:12px;color:var(--muted);margin-top:4px}
.sq-chart{margin-top:16px}
.sq-period{display:flex;justify-content:space-between;font-size:11.5px;color:var(--muted);margin-top:4px}
.sq-stats{display:grid;gap:10px 18px;margin-top:16px;padding-top:14px;border-top:1px solid var(--grid)}
.sq-sl{font-size:12px;color:var(--muted)}
.sq-sv{font-size:15px;font-weight:600;color:var(--text);font-variant-numeric:tabular-nums}
`,
  render(d, ctx) {
    const { theme } = ctx;
    const fmt = makeFormatter({ style: 'currency', currency: d.currency });
    const base = d.previous_close ?? d.prices?.[0];
    const change = d.change ?? (base != null ? d.price - base : null);
    const pct = d.change_percent ?? (base ? ((d.price - base) / base) * 100 : null);
    const up = (change ?? pct ?? 0) >= 0;
    const color = up ? theme.status.good : theme.status.critical;
    const ink = up ? theme.positive : theme.negative;
    const sign = up ? '+' : '−';
    const changeText = [change != null ? `${sign}${fmt(Math.abs(change))}` : null, pct != null ? `(${sign}${Math.abs(pct).toFixed(2)}%)` : null].filter(Boolean).join(' ');
    const marketColor = d.market === 'open' ? theme.status.good : d.market === 'closed' ? theme.muted : theme.status.warning;
    const marketText = { open: 'Market open', closed: 'Market closed', pre: 'Pre-market', after: 'After hours' };
    const statCols = fitColumns(3, ctx.width, 140, 18);
    return html`<div class="sq-head">
        <div>
          <div class="sq-sym"><b>${d.symbol}</b>${d.exchange ? html`<span class="sq-ex">${d.exchange}</span>` : null}</div>
          ${d.name ? html`<div class="sq-name">${d.name}</div>` : null}
        </div>
        ${d.market ? html`<span class="sq-mkt"><i style="${`background:${marketColor}`}"></i>${marketText[d.market]}</span>` : null}
      </div>
      <div class="sq-price">
        <span class="sq-p" style="${`font-size:${fitFontSize(fmt(d.price), ctx.width, 44, 24)}px`}">${fmt(d.price)}</span>
        ${changeText ? html`<span class="sq-ch" style="${style({ color: ink })}">${changeText}</span>` : null}
      </div>
      ${d.as_of ? html`<div class="sq-asof">${d.as_of}${d.previous_close != null ? ` · Prev. close ${fmt(d.previous_close)}` : ''}</div>` : null}
      ${d.prices
        ? html`<div class="sq-chart">${priceChart(d.prices, { width: Math.floor(ctx.width), height: 150, color, theme, baseline: d.previous_close })}${
            d.period ? html`<div class="sq-period"><span>${d.period}</span><span>Low ${fmt(Math.min(...d.prices))} · High ${fmt(Math.max(...d.prices))}</span></div>` : null
          }</div>`
        : null}
      ${d.stats?.length
        ? html`<div class="sq-stats" style="${`grid-template-columns:repeat(${statCols}, minmax(0, 1fr))`}">${d.stats.map(
            (s) => html`<div><div class="sq-sl">${s.label}</div><div class="sq-sv">${typeof s.value === 'number' ? s.value.toLocaleString('en-US') : s.value}</div></div>`,
          )}</div>`
        : null}`;
  },
});

export const watchlist = defineTemplate({
  id: 'watchlist',
  title: 'Watchlist',
  summary: 'several tickers',
  category: 'data',
  description:
    'A list of tickers with name, mini chart, price and a green/red change pill. Use for portfolios, market overviews, crypto prices and FX rates.',
  schema: z.object({
    ...titleFields,
    quotes: z
      .array(
        z.object({
          symbol: z.string().min(1).max(16),
          name: z.string().max(80).optional(),
          price: z.number(),
          change_percent: z.number().describe('Percent, e.g. -0.84'),
          prices: z.array(z.number()).min(2).max(500).optional().describe('Recent prices for the mini chart'),
          currency,
        }),
      )
      .min(1)
      .max(30),
  }),
  example: {
    title: 'Watchlist',
    subtitle: 'Oct 9 close',
    quotes: [
      { symbol: 'ACME', name: 'Acme Corporation', price: 199.1, change_percent: 1.95, prices: [195, 196, 196.4, 197.6, 198.2, 197.4, 198.8, 199.1], currency: 'USD' },
      { symbol: 'GLBX', name: 'Globex', price: 84.32, change_percent: -0.84, prices: [85.1, 85.4, 85, 84.6, 84.9, 84.5, 84.2, 84.3], currency: 'USD' },
      { symbol: 'INTL', name: 'Initech', price: 412.77, change_percent: 0.32, prices: [410, 411.2, 410.6, 412, 411.5, 412.3, 413, 412.8], currency: 'USD' },
      { symbol: 'BTC', name: 'Bitcoin', price: 81_340, change_percent: -2.41, prices: [83.4, 83.1, 82.6, 82.9, 82.1, 81.7, 81.9, 81.3], currency: 'USD' },
    ],
  },
  fit: 'content',
  minWidth: 360,
  width: 600,
  css: /* css */ `
/* One grid for all rows so charts, prices and pills line up. */
.wl{display:grid;grid-template-columns:minmax(0, 1fr) auto auto auto}
.wl.nospark{grid-template-columns:minmax(0, 1fr) auto auto}
.wl-row{display:contents}
.wl-row > *{padding:11px 0;display:flex;flex-direction:column;justify-content:center}
.wl-row > * + *{padding-left:16px}
.wl-row + .wl-row > *{border-top:1px solid var(--grid)}
.wl-row > .wl-price,.wl-row > .wl-pc{align-items:flex-end}
.wl-sym{font-size:15px;font-weight:700;color:var(--text)}
.wl-name{font-size:12.5px;color:var(--text-2);margin-top:1px}
.wl-price{font-size:15px;font-weight:600;color:var(--text);text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.wl-pill{font-size:13px;font-weight:650;color:#fff;border-radius:calc(7px * var(--rk));padding:4px 8px;text-align:right;min-width:72px;font-variant-numeric:tabular-nums;white-space:nowrap}
`,
  render(d, ctx) {
    const { theme } = ctx;
    const spark = ctx.width >= 420;
    return html`${header(d)}<div class="${`wl${spark ? '' : ' nospark'}`}">${d.quotes.map((q) => {
      const up = q.change_percent >= 0;
      const fmt = makeFormatter({ style: 'currency', currency: q.currency });
      return html`<div class="wl-row">
        <div><div class="wl-sym">${q.symbol}</div>${q.name ? html`<div class="wl-name">${q.name}</div>` : null}</div>
        ${spark ? html`<div>${q.prices ? priceChart(q.prices, { width: 90, height: 32, color: up ? theme.status.good : theme.status.critical, theme, fill: false }) : null}</div>` : null}
        <div class="wl-price">${fmt(q.price)}</div>
        <div class="wl-pc"><span class="wl-pill" style="${style({ background: up ? theme.status.good : theme.status.critical })}">${`${up ? '+' : '−'}${Math.abs(q.change_percent).toFixed(2)}%`}</span></div>
      </div>`;
    })}</div>`;
  },
});
