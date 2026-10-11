import { z } from 'zod';
import { teamArt } from '../../core/art.ts';
import { backdrop, backgroundFields } from '../../core/backdrop.ts';
import { colorSchema, imageUrlSchema } from '../../core/format.ts';
import { html, style, type Html } from '../../core/html.ts';
import { icon } from '../../core/icons.ts';
import { fitFontSize } from '../../core/measure.ts';
import { hashHue } from '../../core/theme.ts';
import { defineTemplate } from '../../core/types.ts';
import { imageBackground, initials } from '../../core/ui.ts';

const team = z.object({
  name: z.string().min(1).max(60),
  short: z.string().max(5).optional().describe('Abbreviation, e.g. "LAL"'),
  score: z.union([z.number(), z.string().max(12)]).optional().describe('Omit before the game starts'),
  logo_url: imageUrlSchema.optional(),
  color: colorSchema.optional().describe('Primary team color'),
  record: z.string().max(20).optional().describe('e.g. "12-4"'),
});
type Team = z.infer<typeof team>;

const EVENT_ICONS: Record<string, string> = { goal: 'circle-dot', score: 'circle-dot', card: 'square', yellow_card: 'square', red_card: 'square', sub: 'repeat-2', injury: 'cross', note: 'info' };

/** A team's color: given, or a stable deep tone from its name. */
function teamColor(t: Team): string {
  return t.color ?? `hsl(${hashHue(t.name)} 55% 34%)`;
}

export const sportsScore = defineTemplate({
  id: 'sports_score',
  title: 'Sports score',
  summary: 'a game or match score',
  category: 'data',
  description:
    'A scoreboard for any sport: two teams with logos or initials, score, live clock or final status, venue, a period-by-period box score and key events (goals, cards, substitutions). Team colors drive the background.',
  schema: z.object({
    league: z.string().max(60).optional(),
    sport: z.string().max(30).optional().describe('e.g. "soccer", "basketball"; used for photo backgrounds'),
    status: z.enum(['scheduled', 'live', 'halftime', 'final', 'postponed']).optional().describe('Defaults to final when scores are given, scheduled otherwise'),
    clock: z.string().max(20).optional().describe('Live clock or period, e.g. "72\'" or "Q3 4:12"; or the start time when scheduled'),
    venue: z.string().max(80).optional(),
    date: z.string().max(40).optional(),
    home: team,
    away: team,
    periods: z
      .object({
        labels: z.array(z.string().max(6)).min(1).max(12).describe('e.g. ["1", "2", "3", "4"] or ["1H", "2H"]'),
        home: z.array(z.union([z.number(), z.null()])),
        away: z.array(z.union([z.number(), z.null()])),
      })
      .optional(),
    events: z
      .array(
        z.object({
          time: z.string().max(10).describe('e.g. "23\'"'),
          team: z.enum(['home', 'away']),
          text: z.string().max(120),
          kind: z.enum(['goal', 'score', 'yellow_card', 'red_card', 'sub', 'injury', 'note']).default('note'),
        }),
      )
      .max(20)
      .optional(),
    ...backgroundFields,
  }),
  example: {
    league: 'Premier League · Matchweek 8',
    sport: 'soccer',
    status: 'live',
    clock: "72'",
    venue: 'Emirates Stadium',
    home: { name: 'Arsenal', short: 'ARS', score: 2, color: '#c8102e' },
    away: { name: 'Chelsea', short: 'CHE', score: 1, color: '#034694' },
    events: [
      { time: "23'", team: 'home', text: 'Saka', kind: 'goal' },
      { time: "41'", team: 'away', text: 'Palmer (pen.)', kind: 'goal' },
      { time: "58'", team: 'away', text: 'Caicedo', kind: 'yellow_card' },
      { time: "66'", team: 'home', text: 'Ødegaard', kind: 'goal' },
    ],
  },
  width: 640,
  css: /* css */ `
.sc-hero{border-radius:calc(16px * var(--rk));padding:18px 20px 22px;color:#fff}
.sc-top{display:flex;justify-content:space-between;align-items:center;gap:10px;font-size:12.5px;font-weight:600;opacity:.9}
.sc-status{display:inline-flex;align-items:center;gap:6px;padding:3px 10px;border-radius:var(--pill);background:rgba(0,0,0,.35);white-space:nowrap;
  font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase}
.sc-status i{width:7px;height:7px;border-radius:50%;background:#ff4d4f;box-shadow:0 0 0 3px rgba(255,77,79,.3)}
.sc-board{display:grid;grid-template-columns:minmax(0, 1fr) auto minmax(0, 1fr);align-items:center;gap:14px;margin-top:18px}
.sc-team{display:flex;flex-direction:column;align-items:center;gap:8px;text-align:center;min-width:0}
.sc-logo{width:64px;height:64px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:800;
  color:#fff;box-shadow:0 0 0 3px rgba(255,255,255,.85),0 6px 18px rgba(0,0,0,.25);background-color:rgba(255,255,255,.15)}
.sc-name{font-size:16px;font-weight:700;line-height:1.2;text-shadow:0 1px 8px rgba(0,0,0,.3)}
.sc-rec{font-size:12px;opacity:.8}
.sc-score{display:flex;align-items:center;gap:14px;font-weight:800;letter-spacing:-0.03em;font-variant-numeric:tabular-nums;
  text-shadow:0 2px 14px rgba(0,0,0,.3)}
.sc-score .sc-dash{opacity:.6;font-weight:500}
.sc-lose{opacity:.55}
.sc-meta{text-align:center;font-size:13px;font-weight:600;margin-top:12px;opacity:.9}
.sc-box{width:100%;border-collapse:collapse;margin-top:16px;font-size:13.5px;font-variant-numeric:tabular-nums}
.sc-box th{font-size:12px;font-weight:600;color:var(--muted);padding:0 8px 6px;text-align:center;border-bottom:1px solid var(--axis)}
.sc-box th:first-child,.sc-box td:first-child{text-align:left;padding-left:0}
.sc-box td{padding:7px 8px;text-align:center;border-bottom:1px solid var(--grid);color:var(--text)}
.sc-box td.sc-t{font-weight:700}
.sc-ev{margin-top:14px;display:grid;grid-template-columns:1fr auto 1fr;row-gap:6px;column-gap:12px;font-size:13.5px;color:var(--text)}
.sc-ev-l{text-align:right}
.sc-ev-time{font-size:12px;font-weight:650;color:var(--muted);text-align:center;font-variant-numeric:tabular-nums}
.sc-ev .icon{vertical-align:-2px;margin:0 4px}
`,
  async render(d, ctx) {
    const [hc, ac] = [teamColor(d.home), teamColor(d.away)];
    const bg = await backdrop({
      mode: d.background,
      url: d.background_url,
      query: d.background_image_query_keyword ?? (d.sport ? `${d.sport} stadium` : 'stadium lights'),
      art: () => teamArt(hc, ac, Math.round(ctx.width), 260),
    });
    const hasScore = d.home.score != null || d.away.score != null;
    const status = d.status ?? (hasScore ? 'final' : 'scheduled');
    const final = status === 'final';
    const hs = Number(d.home.score);
    const as = Number(d.away.score);
    const decided = final && Number.isFinite(hs) && Number.isFinite(as) && hs !== as;
    const statusText = { scheduled: d.clock ?? 'Upcoming', live: d.clock ? `Live · ${d.clock}` : 'Live', halftime: 'Half-time', final: 'Final', postponed: 'Postponed' }[status];
    const logo = (t: Team, color: string): Html =>
      html`<span class="sc-logo bg-img" style="${style({ 'background-image': t.logo_url ? imageBackground(t.logo_url, t.name) : undefined, background: t.logo_url ? undefined : color })}">${t.logo_url ? '' : (t.short ?? initials(t.name))}</span>`;
    const scoreSize = fitFontSize(`${d.home.score ?? ''} – ${d.away.score ?? ''}`, ctx.width * 0.38, 56, 24);

    const box = d.periods
      ? html`<table class="sc-box"><thead><tr><th></th>${d.periods.labels.map((l) => html`<th>${l}</th>`)}<th>T</th></tr></thead><tbody>
          ${(['home', 'away'] as const).map((side) => {
            const t = d[side];
            return html`<tr><td class="sc-t">${t.short ?? t.name}</td>${d.periods!.labels.map((_, i) => html`<td>${d.periods![side][i] ?? '–'}</td>`)}<td class="sc-t">${t.score ?? '–'}</td></tr>`;
          })}
        </tbody></table>`
      : null;

    return html`<div class="${`sc-hero${bg ? ' on-bk' : ''}`}" style="${bg ? '' : style({ background: `linear-gradient(115deg, ${hc} 50%, ${ac} 50%)` })}">
        ${bg?.layer ?? null}
        <div class="sc-top"><span>${d.league ?? ''}</span><span class="sc-status">${status === 'live' ? html`<i></i>` : null}${statusText}</span></div>
        <div class="sc-board">
          <div class="${`sc-team${decided && hs < as ? ' sc-lose' : ''}`}">${logo(d.home, hc)}<div class="sc-name">${d.home.name}</div>${d.home.record ? html`<div class="sc-rec">${d.home.record}</div>` : null}</div>
          <div class="sc-score" style="${`font-size:${scoreSize}px`}">${hasScore
            ? html`<span class="${decided && hs < as ? 'sc-lose' : ''}">${d.home.score ?? 0}</span><span class="sc-dash">–</span><span class="${decided && as < hs ? 'sc-lose' : ''}">${d.away.score ?? 0}</span>`
            : html`<span class="sc-dash" style="font-size:.5em">vs</span>`}</div>
          <div class="${`sc-team${decided && as < hs ? ' sc-lose' : ''}`}">${logo(d.away, ac)}<div class="sc-name">${d.away.name}</div>${d.away.record ? html`<div class="sc-rec">${d.away.record}</div>` : null}</div>
        </div>
        ${d.venue || d.date ? html`<div class="sc-meta">${[d.venue, d.date].filter(Boolean).join(' · ')}</div>` : null}
      </div>
      ${box}
      ${d.events?.length
        ? html`<div class="sc-ev">${d.events.map((e) => {
            const glyph = html`<span style="${style({ color: e.kind === 'red_card' ? 'var(--critical)' : e.kind === 'yellow_card' ? 'var(--warning)' : 'var(--text-2)', display: 'inline-flex' })}">${icon(EVENT_ICONS[e.kind] ?? 'info', { size: 13, strokeWidth: e.kind.endsWith('card') ? 0 : 2.5 })}</span>`;
            const label = html`${e.kind.endsWith('card') ? html`<span style="${style({ display: 'inline-block', width: 9, height: 12, 'border-radius': 2, margin: '0 5px', 'vertical-align': -1, background: e.kind === 'red_card' ? 'var(--critical)' : 'var(--warning)' })}"></span>` : glyph}${e.text}`;
            return html`<div class="sc-ev-l">${e.team === 'home' ? label : ''}</div><div class="sc-ev-time">${e.time}</div><div>${e.team === 'away' ? label : ''}</div>`;
          })}</div>`
        : null}`;
  },
});
