import { z } from 'zod';
import { html, style } from '../../core/html.ts';
import { icon } from '../../core/icons.ts';
import { hiddenCount, keepFirst, moreLabel } from '../../core/truncate.ts';
import { defineTemplate } from '../../core/types.ts';
import { CIRCLE_ROW, circleRow } from '../../core/ui.ts';

const STATES = ['operational', 'degraded', 'partial_outage', 'major_outage', 'maintenance'] as const;
type State = (typeof STATES)[number];

const META: Record<State, { label: string; icon: string; color: string; rank: number }> = {
  operational: { label: 'Operational', icon: 'circle-check', color: 'var(--good)', rank: 0 },
  maintenance: { label: 'Maintenance', icon: 'wrench', color: 'var(--accent)', rank: 1 },
  degraded: { label: 'Degraded performance', icon: 'triangle-alert', color: 'var(--warning)', rank: 2 },
  partial_outage: { label: 'Partial outage', icon: 'circle-alert', color: 'var(--serious)', rank: 3 },
  major_outage: { label: 'Major outage', icon: 'octagon-alert', color: 'var(--critical)', rank: 4 },
};

/** Daily uptime percentages map onto states so history can be given either way. */
function toState(v: State | number | null): State | null {
  if (v == null) return null;
  if (typeof v === 'string') return v;
  if (v >= 99.95) return 'operational';
  if (v >= 99) return 'degraded';
  if (v >= 95) return 'partial_outage';
  return 'major_outage';
}

/** 60 days of 100% uptime with the given exceptions (example data). */
const days = (bad: Record<number, number>) => Array.from({ length: 60 }, (_, i) => bad[i] ?? 100);

/** The worst state across services and the banner line for it. */
function overall(services: Array<{ status: State }>) {
  const worst = services.reduce<State>((w, s) => (META[s.status].rank > META[w].rank ? s.status : w), 'operational');
  const affected = services.filter((s) => s.status !== 'operational').length;
  const bannerText =
    worst === 'operational'
      ? 'All systems operational'
      : worst === 'maintenance'
        ? 'Scheduled maintenance in progress'
        : worst === 'major_outage'
          ? 'Major outage'
          : `${affected} service${affected === 1 ? '' : 's'} experiencing issues`;
  return { worst, bannerText };
}

/** Shorter state names for a round screen's narrow lines. */
const SHORT: Record<State, string> = { operational: 'Operational', maintenance: 'Maintenance', degraded: 'Degraded', partial_outage: 'Partial outage', major_outage: 'Outage' };

/** On a round screen the banner counts every service, also those cut for room. */
const ALL = Symbol('all services');

export const statusPage = defineTemplate({
  id: 'status_page',
  title: 'Status page',
  summary: 'service health and uptime',
  category: 'data',
  description:
    'A service status page: overall banner, each service with its current state, uptime and a per-day history strip, plus recent incidents. Use for system health, on-call summaries and outage reports.',
  schema: z.object({
    title: z.string().max(120).optional(),
    updated: z.string().max(60).optional().describe('e.g. "Updated 2 min ago"'),
    services: z
      .array(
        z.object({
          name: z.string().min(1).max(80),
          status: z.enum(STATES),
          uptime: z.number().min(0).max(100).optional().describe('Uptime percent over the history window, e.g. 99.98'),
          history: z
            .array(z.union([z.enum(STATES), z.number().min(0).max(100), z.null()]))
            .max(90)
            .optional()
            .describe('Oldest → newest, one entry per day: a state or that day’s uptime percent'),
          description: z.string().max(160).optional(),
        }),
      )
      .min(1)
      .max(30),
    incidents: z
      .array(
        z.object({
          title: z.string().min(1).max(160),
          status: z.enum(['investigating', 'identified', 'monitoring', 'resolved']),
          time: z.string().max(60).optional(),
          message: z.string().max(400).optional(),
        }),
      )
      .max(6)
      .optional(),
  }),
  example: {
    title: 'Acme Cloud status',
    updated: 'Updated 2 min ago',
    services: [
      { name: 'API', status: 'operational', uptime: 99.98, history: days({ 12: 99.4, 41: 98.2 }) },
      { name: 'Dashboard', status: 'operational', uptime: 100, history: days({}) },
      { name: 'Search', status: 'degraded', uptime: 99.71, history: days({ 33: 97.5, 58: 99.5, 59: 99.2 }) },
      { name: 'Webhooks', status: 'operational', uptime: 99.93, history: days({ 20: 94.1 }) },
    ],
    incidents: [
      { title: 'Elevated search latency', status: 'monitoring', time: 'Today, 14:21 UTC', message: 'A fix has been deployed and we are monitoring results.' },
    ],
  },
  width: (d) => (d.services.some((s) => s.history?.length) ? 760 : 560),
  css: /* css */ `
.ss-banner{display:flex;align-items:center;gap:10px;padding:14px 16px;border-radius:calc(12px * var(--rk));font-size:16px;font-weight:650;color:var(--text);
  background:color-mix(in srgb, var(--c) 12%, var(--surface));border:1px solid color-mix(in srgb, var(--c) 35%, transparent)}
.ss-banner .icon{color:var(--c)}
.ss-upd{margin-left:auto;font-size:12.5px;font-weight:500;color:var(--text-2)}
.ss-title{font-size:20px;font-weight:650;letter-spacing:-0.012em;margin-bottom:14px;color:var(--text)}
.ss-list{margin-top:18px;border:1px solid var(--border);border-radius:calc(12px * var(--rk))}
.ss-svc{padding:14px 16px}
.ss-svc + .ss-svc{border-top:1px solid var(--grid)}
.ss-row{display:flex;align-items:center;justify-content:space-between;gap:12px}
.ss-name{font-size:15px;font-weight:600;color:var(--text)}
.ss-desc{font-size:12.5px;color:var(--text-2);margin-top:1px}
.ss-state{display:inline-flex;align-items:center;gap:6px;font-size:13px;font-weight:550;color:var(--text-2);white-space:nowrap}
.ss-state .icon{color:var(--c)}
.ss-bars{display:flex;gap:2px;height:28px;margin-top:10px}
.ss-bars span{flex:1;border-radius:calc(2px * var(--rk));min-width:2px}
.ss-axis{display:flex;justify-content:space-between;margin-top:6px;font-size:11.5px;color:var(--muted);font-variant-numeric:tabular-nums}
.ss-inc{margin-top:18px}
.ss-inc-h{font-size:13px;font-weight:650;color:var(--text-2);letter-spacing:.04em;text-transform:uppercase;margin-bottom:8px}
.ss-i{padding:12px 0;border-top:1px solid var(--grid)}
.ss-i-t{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:15px;font-weight:600;color:var(--text)}
.ss-i-m{font-size:13.5px;color:var(--text-2);margin-top:3px}
.ss-i-time{font-size:12px;color:var(--muted);margin-top:3px}
.ss-key{display:flex;gap:14px;flex-wrap:wrap;margin-top:12px;font-size:12px;color:var(--text-2)}
.ss-key span{display:inline-flex;align-items:center;gap:5px}
.ss-key i{width:9px;height:9px;border-radius:calc(2px * var(--rk));display:inline-block}
`,
  circleCss: /* css */ `
.ss-rtitle{font-size:15px;font-weight:650;color:var(--text);margin-bottom:6px}
.ss-rbanner{display:flex;align-items:center;justify-content:center;gap:8px;padding:8px 14px;border-radius:calc(16px * var(--rk));font-size:14px;font-weight:650;color:var(--text);
  background:color-mix(in srgb, var(--c) 12%, var(--surface));border:1px solid color-mix(in srgb, var(--c) 35%, transparent)}
.ss-rbanner .icon{color:var(--c);flex:none}
.ss-rupd{font-size:12px;color:var(--text-2);margin-top:4px}
.ss-rlist{display:flex;flex-direction:column;gap:4px;margin-top:10px}
.ss-r{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:7px 14px;border-radius:calc(12px * var(--rk));background:var(--subtle);text-align:left}
.ss-r .ss-name{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:6em}
.ss-r .ss-state{flex:none}
.ss-up{font-size:12px;color:var(--muted);font-variant-numeric:tabular-nums;margin-right:2px}
.ss-rinc{display:flex;align-items:center;justify-content:center;gap:6px;font-size:12.5px;color:var(--text-2);margin-top:8px}
.ss-rinc .icon{color:var(--warning);flex:none}
.ss-rinc span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ss-more{font-size:13px;color:var(--text-2);margin-top:6px}
`,
  truncateCircle(d, keep) {
    const cut = keepFirst(d, 'services', keep);
    return { ...cut, data: Object.assign(cut.data, { [ALL]: d.services }) };
  },
  renderCircle(d) {
    // No day strips: each service is one line with its uptime and state; the latest incident as a line under them.
    const { worst, bannerText } = overall((d as typeof d & { [ALL]?: typeof d.services })[ALL] ?? d.services);
    const hidden = hiddenCount(d);
    const inc = d.incidents?.find((i) => i.status !== 'resolved') ?? d.incidents?.[0];
    return html`${d.title ? html`<div class="${circleRow('ss-rtitle')}">${d.title}</div>` : null}
    <div class="${circleRow('ss-rbanner')}" style="${`--c:${META[worst].color}`}">${icon(META[worst].icon, { size: 17 })}<span>${bannerText}</span></div>
    ${d.updated ? html`<div class="${circleRow('ss-rupd')}">${d.updated}</div>` : null}
    <div class="ss-rlist">${d.services.map((s) => {
      const m = META[s.status];
      return html`<div class="${circleRow('ss-r')}">
        <div class="ss-name">${s.name}</div>
        <span class="ss-state" style="${`--c:${m.color}`}">${s.uptime != null ? html`<span class="ss-up">${s.uptime.toFixed(2)}%</span>` : null}${icon(m.icon, { size: 15 })}${SHORT[s.status]}</span>
      </div>`;
    })}</div>${hidden ? html`<div class="${`ss-more ${CIRCLE_ROW}`}">${moreLabel(hidden)}</div>` : null}
    ${inc ? html`<div class="${circleRow('ss-rinc')}">${icon('triangle-alert', { size: 14 })}<span>${inc.title} · ${inc.status[0]!.toUpperCase() + inc.status.slice(1)}</span></div>` : null}`;
  },
  render(d) {
    const { worst, bannerText } = overall(d.services);
    const historyLen = Math.max(0, ...d.services.map((s) => s.history?.length ?? 0));
    const seen = new Set<State>();
    for (const s of d.services) for (const h of s.history ?? []) {
      const st = toState(h);
      if (st) seen.add(st);
    }
    return html`${d.title ? html`<div class="ss-title">${d.title}</div>` : null}
    <div class="ss-banner" style="${`--c:${META[worst].color}`}">${icon(META[worst].icon, { size: 20 })}${bannerText}${
      d.updated ? html`<span class="ss-upd">${d.updated}</span>` : null
    }</div>
    <div class="ss-list">${d.services.map((s) => {
      const m = META[s.status];
      return html`<div class="ss-svc">
        <div class="ss-row">
          <div><div class="ss-name">${s.name}</div>${s.description ? html`<div class="ss-desc">${s.description}</div>` : null}</div>
          <span class="ss-state" style="${`--c:${m.color}`}">${icon(m.icon, { size: 15 })}${m.label}</span>
        </div>
        ${s.history?.length
          ? html`<div class="ss-bars">${s.history.map((h) => {
              const st = toState(h);
              return html`<span style="${style({ background: st ? META[st].color : 'var(--subtle)', opacity: st === 'operational' ? 0.75 : 1 })}"></span>`;
            })}</div>
            <div class="ss-axis"><span>${s.history.length} days ago</span>${s.uptime != null ? html`<span>${s.uptime.toFixed(2)}% uptime</span>` : null}<span>Today</span></div>`
          : s.uptime != null
            ? html`<div class="ss-axis"><span></span><span>${s.uptime.toFixed(2)}% uptime</span></div>`
            : null}
      </div>`;
    })}</div>
    ${historyLen && seen.size > 1
      ? html`<div class="ss-key">${STATES.filter((st) => seen.has(st)).map((st) => html`<span><i style="${`background:${META[st].color}`}"></i>${META[st].label}</span>`)}</div>`
      : null}
    ${d.incidents?.length
      ? html`<div class="ss-inc"><div class="ss-inc-h">Incidents</div>${d.incidents.map(
          (i) => html`<div class="ss-i">
            <div class="ss-i-t">${i.title}<span class="tag">${i.status[0]!.toUpperCase() + i.status.slice(1)}</span></div>
            ${i.message ? html`<div class="ss-i-m">${i.message}</div>` : null}
            ${i.time ? html`<div class="ss-i-time">${i.time}</div>` : null}
          </div>`,
        )}</div>`
      : null}`;
  },
});
