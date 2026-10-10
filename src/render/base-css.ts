/** Stylesheet shared by every template. Templates add their own via `css`. */
export const BASE_CSS = /* css */ `
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html,body{background:transparent}
body{font-family:var(--font-sans);color:var(--text);font-size:14px;line-height:1.45;
  -webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility;font-synthesis:none;
  /* Nothing is ever cut off: long words and URLs break rather than overflow. */
  overflow-wrap:anywhere}
#root{position:relative;overflow:hidden}
.frame-surface{background:var(--surface)}
.frame-plane{background:var(--plane)}
#root.transparent{background:transparent}
svg{display:block}
img{display:block;max-width:100%}
.icon{display:inline-block;flex:none;vertical-align:-0.15em}
.glyph{display:inline-flex;align-items:center;justify-content:center;line-height:1;vertical-align:middle}
.num{font-variant-numeric:tabular-nums}
.muted{color:var(--muted)}
.text-2{color:var(--text-2)}
.shrink{min-width:0}
.bg-img{background-size:cover;background-position:center;background-repeat:no-repeat}

.hdr{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:20px}
.hdr-text{min-width:0}
.hdr-title{font-size:20px;line-height:1.3;font-weight:600;letter-spacing:-0.012em;color:var(--text)}
.hdr-sub{margin-top:4px;font-size:14px;line-height:1.45;color:var(--text-2)}
.hdr-aside{flex:0 1 auto;max-width:45%;text-align:right;color:var(--text-2);font-size:13px}

.legend{display:flex;flex-wrap:wrap;gap:6px 18px;margin-bottom:14px;font-size:13px;line-height:20px;color:var(--text-2)}
.legend-item{display:inline-flex;align-items:center;gap:7px;min-width:0;max-width:100%}
.legend-item > .key{flex:none}
.key{width:10px;height:10px;border-radius:3px;flex:none}
.key-line{width:14px;height:3px;border-radius:2px}
.key-dot{border-radius:50%}
.key-dash{width:16px;height:0;background:none!important;border-top:2px dashed var(--text-2);border-radius:0}

.status{display:inline-flex;align-items:center;gap:5px;font-size:12px;font-weight:500;color:var(--text-2);white-space:nowrap}
.status .icon{color:var(--c)}
.status-icon{display:inline-flex}

.tag{display:inline-flex;align-items:center;gap:4px;padding:2px 9px;border-radius:999px;background:var(--subtle);
  color:var(--text-2);font-size:12px;line-height:18px;font-weight:500;max-width:100%}

.delta-wrap{display:inline-flex;align-items:baseline;gap:6px;flex-wrap:wrap}
.delta{display:inline-flex;align-items:center;gap:2px;font-size:13px;font-weight:600;min-width:0}
.delta > .icon{flex:none}
.num,.nw{white-space:nowrap}
.delta .icon{vertical-align:middle}
.delta.pos{color:var(--positive)}
.delta.neg{color:var(--negative)}
.delta.flat{color:var(--muted)}
.delta.neu{color:var(--text-2);font-weight:550}
.sum{display:flex;flex-wrap:wrap;gap:10px 28px;margin-bottom:16px;padding-bottom:14px;border-bottom:1px solid var(--grid)}
.sum-l{font-size:11.5px;font-weight:550;color:var(--muted);letter-spacing:.02em}
.sum-v{font-size:16px;font-weight:620;color:var(--text);margin-top:2px;white-space:nowrap;font-variant-numeric:tabular-nums}
.sum-n{font-size:12.5px;font-weight:500;color:var(--text-2)}
.delta-label{font-size:12px;color:var(--muted)}

.plot{position:relative}
.plot svg{overflow:visible}
.axis-title{font-size:12px;line-height:16px;color:var(--text-2)}
.axis-title.y{margin-bottom:8px}
.axis-title.x{text-align:center;margin-top:10px}

.on-bk{position:relative;isolation:isolate;overflow:hidden}
.bk{position:absolute;inset:0;z-index:-2}
.bk > svg{position:absolute;inset:0;width:100%;height:100%}
.bk-scrim{position:absolute;inset:0;z-index:-1;background:linear-gradient(180deg, rgba(0,0,0,.18), rgba(0,0,0,.58))}

.prose{color:var(--text);font-size:15px;line-height:1.6}
.prose > * + *{margin-top:0.75em}
.prose h1,.prose h2,.prose h3,.prose h4{line-height:1.25;letter-spacing:-0.015em;font-weight:650}
.prose h1{font-size:2em;letter-spacing:-0.022em}
.prose h2{font-size:1.45em;margin-top:1.3em}
.prose h3{font-size:1.18em;margin-top:1.2em}
.prose h4{font-size:1em;margin-top:1.1em}
.prose :is(h1,h2,h3,h4) + *{margin-top:0.5em}
.prose a{color:var(--accent);text-decoration:underline;text-underline-offset:2px;text-decoration-thickness:1px}
.prose strong{font-weight:620}
.prose ul,.prose ol{padding-left:1.4em}
.prose li + li{margin-top:0.3em}
.prose li::marker{color:var(--muted)}
.prose li:has(> input[type=checkbox]){list-style:none;margin-left:-1.4em}
.prose input[type=checkbox]{appearance:none;width:15px;height:15px;border:1.5px solid var(--axis);border-radius:4px;
  vertical-align:-2px;margin-right:8px;display:inline-block;position:relative}
.prose input[type=checkbox]:checked{background:var(--accent);border-color:var(--accent)}
.prose input[type=checkbox]:checked::after{content:'';position:absolute;left:4px;top:1px;width:4px;height:8px;
  border:solid #fff;border-width:0 2px 2px 0;transform:rotate(45deg)}
.prose blockquote{border-left:3px solid var(--grid);padding-left:1em;color:var(--text-2)}
.prose code{font-family:var(--font-mono);font-size:0.86em;background:var(--subtle);padding:0.12em 0.36em;border-radius:5px}
.prose pre{font-family:var(--font-mono);font-size:13px;line-height:1.6;padding:14px 16px;border-radius:10px;
  background:var(--subtle);white-space:pre-wrap;word-break:break-word;border:1px solid var(--border)}
.prose pre code{background:none;padding:0;font-size:inherit;border-radius:0}
.prose hr{border:0;border-top:1px solid var(--grid);margin:1.5em 0}
.prose table{border-collapse:collapse;width:100%;font-size:0.92em}
.prose th{text-align:left;font-weight:600;color:var(--text-2);border-bottom:1px solid var(--axis);padding:6px 10px}
.prose td{border-bottom:1px solid var(--grid);padding:6px 10px;font-variant-numeric:tabular-nums}
.prose img{border-radius:10px}
.shiki .line{display:block;min-height:1lh}
`;
