import QRCode from 'qrcode';
import { z } from 'zod';
import { html, raw } from '../../core/html.ts';
import { icon } from '../../core/icons.ts';
import { defineTemplate } from '../../core/types.ts';

/** Escapes a value for the WIFI: QR payload format. */
const wifiEscape = (s: string) => s.replace(/([\\;,:"])/g, '\\$1');

function payload(d: { value?: string; wifi?: { ssid: string; password?: string; encryption: string; hidden: boolean } }): string {
  if (d.wifi) {
    const w = d.wifi;
    return `WIFI:T:${w.encryption};S:${wifiEscape(w.ssid)};${w.password ? `P:${wifiEscape(w.password)};` : ''}${w.hidden ? 'H:true;' : ''};`;
  }
  return d.value!;
}

export const qrCode = defineTemplate({
  id: 'qr_code',
  title: 'QR code',
  category: 'basic',
  description:
    'A scannable QR code for a link, text or Wi-Fi network, with a title and caption. Use to hand a URL, contact or network to someone’s phone.',
  schema: z
    .object({
      value: z.string().min(1).max(2000).optional().describe('Text or URL to encode'),
      wifi: z
        .object({
          ssid: z.string().min(1).max(64),
          password: z.string().max(128).optional(),
          encryption: z.enum(['WPA', 'WEP', 'nopass']).default('WPA'),
          hidden: z.boolean().default(false),
        })
        .optional()
        .describe('Encode Wi-Fi credentials instead of `value`'),
      title: z.string().max(80).optional(),
      caption: z.string().max(200).optional().describe('Defaults to the link or network name'),
    })
    .refine((d) => d.value || d.wifi, { message: 'Give a value or wifi details' }),
  example: { title: 'Scan to open the dashboard', value: 'https://uiotg.example.com/dash/weekly-review' },
  width: 380,
  css: /* css */ `
.qr{display:flex;flex-direction:column;align-items:center;text-align:center;gap:14px}
.qr-title{font-size:17px;font-weight:650;color:var(--text);letter-spacing:-0.01em}
.qr-box{background:#fff;border-radius:16px;padding:14px;box-shadow:0 0 0 1px var(--border)}
.qr-box svg{display:block}
.qr-cap{display:flex;align-items:center;gap:6px;font-size:13px;color:var(--text-2);max-width:100%}
.qr-cap .icon{color:var(--muted);flex:none}
.qr-cap span{min-width:0}
`,
  render(d, ctx) {
    const qr = QRCode.create(payload(d), { errorCorrectionLevel: 'M' });
    const n = qr.modules.size;
    const quiet = 2;
    let path = '';
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (qr.modules.get(x, y)) path += `M${x + quiet} ${y + quiet}h1v1h-1z`;
    const px = Math.min(260, ctx.width - 28);
    const dim = n + quiet * 2;
    // Always dark modules on white, whatever the theme: scanners need that contrast.
    const svg = raw(
      `<svg width="${px}" height="${px}" viewBox="0 0 ${dim} ${dim}" shape-rendering="crispEdges" aria-hidden="true"><path d="${path}" fill="#0b0b0b"/></svg>`,
    );
    const isUrl = d.value && /^https?:\/\//i.test(d.value);
    const caption = d.caption ?? (d.wifi ? `Wi-Fi · ${d.wifi.ssid}` : isUrl ? d.value!.replace(/^https?:\/\//i, '') : d.value!.length <= 60 ? d.value : null);
    return html`<div class="qr">
      ${d.title ? html`<div class="qr-title">${d.title}</div>` : null}
      <div class="qr-box">${svg}</div>
      ${caption ? html`<div class="qr-cap">${icon(d.wifi ? 'wifi' : isUrl ? 'link' : 'text', { size: 14 })}<span>${caption}</span></div>` : null}
    </div>`;
  },
});
