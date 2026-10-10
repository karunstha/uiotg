/**
 * Generated background art: themed gradients plus deterministic SVG
 * decoration (stars, snow, confetti…). Offline, license-free, and seeded so
 * the same input always draws the same picture.
 */

export interface Art {
  /** CSS background for the container. */
  background: string;
  /** SVG markup drawn over the background (may be empty). */
  overlay: string;
  /** Text color that reads on this art. */
  ink: '#ffffff' | '#1b1b1b';
}

function seeded(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

const svg = (w: number, h: number, body: string, defs = '') =>
  `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><defs><filter id="soft" filterUnits="userSpaceOnUse" x="-60" y="-60" width="${w + 120}" height="${h + 120}"><feGaussianBlur stdDeviation="14"/></filter>${defs}</defs>${body}</svg>`;

// --- primitives ------------------------------------------------------------------

function stars(r: () => number, w: number, h: number, n: number, yMax = 1): string {
  let out = '';
  for (let i = 0; i < n; i++) {
    const s = 0.6 + r() * 1.6;
    out += `<circle cx="${(r() * w).toFixed(1)}" cy="${(r() * h * yMax).toFixed(1)}" r="${s.toFixed(2)}" fill="#fff" opacity="${(0.35 + r() * 0.6).toFixed(2)}"/>`;
  }
  return out;
}

function snow(r: () => number, w: number, h: number, n: number): string {
  let out = '';
  for (let i = 0; i < n; i++) out += `<circle cx="${(r() * w).toFixed(1)}" cy="${(r() * h).toFixed(1)}" r="${(1 + r() * 3).toFixed(2)}" fill="#fff" opacity="${(0.4 + r() * 0.5).toFixed(2)}"/>`;
  return out;
}

function rain(r: () => number, w: number, h: number, n: number): string {
  let out = '';
  for (let i = 0; i < n; i++) {
    const x = r() * (w + 100) - 50;
    const y = r() * h;
    const l = 14 + r() * 22;
    out += `<line x1="${x.toFixed(1)}" y1="${y.toFixed(1)}" x2="${(x - l * 0.3).toFixed(1)}" y2="${(y + l).toFixed(1)}" stroke="#fff" stroke-width="1.4" stroke-linecap="round" opacity="${(0.15 + r() * 0.25).toFixed(2)}"/>`;
  }
  return out;
}

function clouds(r: () => number, w: number, h: number, n: number, opacity = 0.45): string {
  let out = '';
  for (let i = 0; i < n; i++) {
    const cx = r() * w;
    const cy = h * (0.15 + r() * 0.5);
    const rx = 70 + r() * 120;
    out += `<ellipse cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" rx="${rx.toFixed(1)}" ry="${(rx * 0.38).toFixed(1)}" fill="#fff" opacity="${opacity}" filter="url(#soft)"/>`;
  }
  return out;
}

function confetti(r: () => number, w: number, h: number, n: number, colors: string[]): string {
  let out = '';
  for (let i = 0; i < n; i++) {
    const x = r() * w;
    const y = r() * h;
    const c = colors[Math.floor(r() * colors.length)]!;
    out += r() < 0.5
      ? `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${(5 + r() * 6).toFixed(1)}" height="${(3 + r() * 3).toFixed(1)}" rx="1" fill="${c}" opacity="0.85" transform="rotate(${Math.round(r() * 180)} ${x.toFixed(1)} ${y.toFixed(1)})"/>`
      : `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(2 + r() * 3).toFixed(1)}" fill="${c}" opacity="0.85"/>`;
  }
  return out;
}

function hearts(r: () => number, w: number, h: number, n: number, color: string): string {
  let out = '';
  for (let i = 0; i < n; i++) {
    const s = 0.5 + r() * 1.4;
    out += `<path d="M0 6C0 2 3 0 6 0c2 0 3.5 1.2 4 2.5C10.5 1.2 12 0 14 0c3 0 6 2 6 6 0 6-10 12-10 12S0 12 0 6z" fill="${color}" opacity="${(0.18 + r() * 0.3).toFixed(2)}" transform="translate(${(r() * w).toFixed(1)} ${(r() * h).toFixed(1)}) scale(${s.toFixed(2)}) rotate(${Math.round(r() * 40 - 20)})"/>`;
  }
  return out;
}

function balloons(r: () => number, w: number, h: number, colors: string[]): string {
  let out = '';
  // Kept to the outer edges and low, clear of the centered greeting.
  const spots = [0.05, 0.11, 0.89, 0.95];
  spots.forEach((fx, i) => {
    const cx = w * fx + (r() - 0.5) * 8;
    const cy = h * (0.58 + r() * 0.16);
    const c = colors[i % colors.length]!;
    out += `<path d="M${cx.toFixed(1)} ${(cy + 24).toFixed(1)} q 6 30 -4 ${(h - cy).toFixed(1)}" stroke="#fff" stroke-width="1.2" fill="none" opacity="0.6"/>`;
    out += `<ellipse cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" rx="19" ry="24" fill="${c}" opacity="0.92"/><ellipse cx="${(cx - 6).toFixed(1)}" cy="${(cy - 9).toFixed(1)}" rx="4.5" ry="7" fill="#fff" opacity="0.35"/>`;
  });
  return out;
}

const moon = (cx: number, cy: number, r: number, crescent = true) =>
  `<circle cx="${cx}" cy="${cy}" r="${r * 2.4}" fill="#fff" opacity="0.12" filter="url(#soft)"/><circle cx="${cx}" cy="${cy}" r="${r}" fill="#f6f1d5"/>${crescent ? `<circle cx="${cx + r * 0.45}" cy="${cy - r * 0.25}" r="${r * 0.9}" fill="#1b2347" opacity="0.92"/>` : ''}`;

const sunGlow = (cx: number, cy: number, r: number) =>
  `<circle cx="${cx}" cy="${cy}" r="${r * 3}" fill="#fff6c8" opacity="0.35" filter="url(#soft)"/><circle cx="${cx}" cy="${cy}" r="${r}" fill="#fff3b0" opacity="0.95"/>`;

// --- skies -------------------------------------------------------------------------

export type Sky = 'clear' | 'cloudy' | 'rain' | 'storm' | 'snow' | 'fog' | 'wind';

export function skyArt(sky: Sky, night: boolean, w: number, h: number, seed = 'sky'): Art {
  const r = seeded(seed + sky + night);
  const base: Record<Sky, [string, string]> = night
    ? { clear: ['#0b1433', '#22306a'], cloudy: ['#1b2333', '#3a4558'], rain: ['#141c27', '#2f3c4d'], storm: ['#0f1219', '#2a2f3d'], snow: ['#2a3550', '#58698a'], fog: ['#2b3138', '#4c555e'], wind: ['#16213a', '#34456b'] }
    : { clear: ['#3c8ce7', '#9fd2ff'], cloudy: ['#557089', '#8ea4b9'], rain: ['#40566b', '#71879b'], storm: ['#2c3442', '#56627a'], snow: ['#6a83a0', '#a9bccf'], fog: ['#6f7d88', '#a3afb8'], wind: ['#5b8fc4', '#b5d3ea'] };
  const [top, bottom] = base[sky];
  let body = '';
  if (night) body += stars(r, w, h, sky === 'clear' ? 70 : 20, 0.7) + moon(w * 0.82, h * 0.26, 18, true);
  else if (sky === 'clear' || sky === 'wind') body += sunGlow(w * 0.84, h * 0.22, 26);
  if (sky === 'cloudy' || sky === 'rain' || sky === 'storm' || sky === 'snow') body += clouds(r, w, h, 5, night ? 0.18 : 0.24);
  if (sky === 'rain' || sky === 'storm') body += rain(r, w, h, 90);
  if (sky === 'storm') body += `<path d="M${w * 0.62} ${h * 0.12} l -26 70 h 22 l -18 64 l 52 -88 h -24 l 20 -46 z" fill="#ffe27a" opacity="0.55"/>`;
  if (sky === 'snow') body += snow(r, w, h, 80);
  if (sky === 'fog') for (let i = 0; i < 4; i++) body += `<rect x="-40" y="${(h * (0.35 + i * 0.16)).toFixed(1)}" width="${w + 80}" height="22" rx="11" fill="#fff" opacity="0.28" filter="url(#soft)"/>`;
  if (sky === 'wind') for (let i = 0; i < 6; i++) body += `<path d="M${(r() * w * 0.6).toFixed(1)} ${(h * (0.3 + r() * 0.5)).toFixed(1)} c 60 -14 120 14 ${(160 + r() * 80).toFixed(1)} 0" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round" opacity="0.35"/>`;
  return { background: `linear-gradient(170deg, ${top}, ${bottom})`, overlay: svg(w, h, body), ink: '#ffffff' };
}

/** Sky for a local hour: night, dawn, day or dusk, with the sun or moon on its arc. */
export function hourSky(hour: number, w: number, h: number): Art {
  const night = hour < 5 || hour >= 20;
  const dawn = hour >= 5 && hour < 8;
  const dusk = hour >= 17 && hour < 20;
  const background = night
    ? 'linear-gradient(170deg, #0b1433, #26336b)'
    : dawn
      ? 'linear-gradient(170deg, #4b3b8f, #f29e72)'
      : dusk
        ? 'linear-gradient(170deg, #2d3e8f, #f08a5d)'
        : 'linear-gradient(170deg, #2f7fdc, #6fb0ea)';
  // A small arc in the right-hand third (text sits on the left): sunrise at 6,
  // noon at the top, sunset at 18; the moon mirrors it overnight.
  const t = Math.max(0, Math.min(1, night ? ((hour + 6) % 24) / 12 : (hour - 6) / 12));
  const x = w * (0.72 + t * 0.18);
  const y = h * (0.78 - Math.sin(t * Math.PI) * 0.52);
  const body = night ? stars(seeded(`h${hour}`), w, h, Math.round((w * h) / 900), 0.8) + moon(x, y, Math.max(5, h * 0.09)) : sunGlow(x, y, Math.max(5, h * 0.09));
  return { background, overlay: svg(w, h, body), ink: '#ffffff' };
}

/** Diagonal split in two team colors. */
export function teamArt(a: string, b: string, w: number, h: number): Art {
  let lines = '';
  for (let x = -h; x < w; x += 22) lines += `<line x1="${x}" y1="${h}" x2="${x + h * 0.55}" y2="0" stroke="#fff" stroke-width="1" opacity="0.06"/>`;
  return {
    background: `linear-gradient(115deg, ${a} 0%, ${a} 49.8%, ${b} 50.2%, ${b} 100%)`,
    overlay: svg(w, h, lines + `<rect width="${w}" height="${h}" fill="url(#vig)"/>`, `<radialGradient id="vig" cx="50%" cy="50%" r="75%"><stop offset="0.4" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.45"/></radialGradient>`),
    ink: '#ffffff',
  };
}

// --- occasions ----------------------------------------------------------------------

/** Occasions with a hand-drawn design; anything else gets `festiveArt`. */
export type OccasionTheme = 'birthday' | 'anniversary' | 'wedding';

const party = ['#ffd166', '#ef476f', '#06d6a0', '#118ab2', '#ffffff', '#c77dff'];

export function occasionArt(theme: OccasionTheme, w: number, h: number, seed: string): Art {
  const r = seeded(seed + theme);
  if (theme === 'birthday')
    return { background: 'linear-gradient(150deg, #ff5f8f, #ffb067)', overlay: svg(w, h, confetti(r, w, h, 120, party) + balloons(r, w, h, ['#ffd166', '#06d6a0', '#118ab2', '#c77dff'])), ink: '#ffffff' };
  return {
    background: theme === 'wedding' ? 'linear-gradient(150deg, #5e2f50, #a0607e 60%, #c99474)' : 'linear-gradient(150deg, #3d2c4a, #a4789a 60%, #e6c79c)',
    overlay: svg(w, h, (theme === 'wedding' ? hearts(r, w, h, 18, '#ffffff') : stars(r, w, h, 50)) + confetti(r, w, h, 30, ['#f6e7c1', '#ffffff'])),
    ink: '#ffffff',
  };
}

/** Any other occasion: soft bokeh and confetti over a gradient in `hue` (a color the caller picks, or one hashed from the name). */
export function festiveArt(hue: number, w: number, h: number, seed: string): Art {
  const r = seeded(seed);
  let bokeh = '';
  for (let i = 0; i < 16; i++)
    bokeh += `<circle cx="${(r() * w).toFixed(1)}" cy="${(r() * h).toFixed(1)}" r="${(12 + r() * 40).toFixed(1)}" fill="hsl(${(hue + 30 + r() * 40) % 360} 90% 80%)" opacity="${(0.08 + r() * 0.14).toFixed(2)}" filter="url(#soft)"/>`;
  const sparkle = [`hsl(${(hue + 40) % 360} 95% 75%)`, `hsl(${(hue + 320) % 360} 90% 78%)`, '#ffffff', '#ffd166'];
  return {
    background: `linear-gradient(155deg, hsl(${hue} 58% 17%), hsl(${(hue + 10) % 360} 60% 30%) 60%, hsl(${(hue + 22) % 360} 62% 40%))`,
    overlay: svg(w, h, bokeh + stars(r, w, h, 30) + confetti(r, w, h, 50, sparkle)),
    ink: '#ffffff',
  };
}
