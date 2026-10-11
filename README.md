# uiotg: User Interface On The Go

An MCP server that turns structured data into polished UI images. A model calls one tool with a **template** and some **data**, and gets back a rendered PNG: a chart, a table, KPI tiles, an album card, a weather card, or a whole dashboard.

```jsonc
// tools/call → render
{
  "template": "line_chart",
  "data": {
    "title": "API latency",
    "x": ["00:00", "04:00", "08:00", "12:00", "16:00", "20:00"],
    "series": [{ "name": "p95", "values": [182, 171, 205, 262, 239, 204] }],
    "reference_lines": [{ "value": 250, "label": "SLO" }],
    "format": { "suffix": " ms" }
  },
  "options": { "theme": "dark" }
}
// ← image/png
```

## Templates

61 templates across six categories. They are representative: they show state and results, never controls (no play buttons, toggles or slider knobs). Run `npm run gallery` to render every example in light and dark mode into `gallery/index.html`.

| Category | Templates |
|---|---|
| **Basic elements** | `badge` · `alert` · `key_value` (receipts, specs) · `link_card` · `avatar` · `notification` · `chat` · `image_card` · `rating` · `sparkline` · `tags` · `countdown` · `calendar_date` · `qr_code` · `volume` (volume/brightness/level slider) · `clock` (analog/digital, any time zone) · `world_clock` · `alarm` |
| **Text & content** | `text_card` · `quote` · `markdown` (with $math$) · `code` (Shiki, 18 themes) · `list` · `steps` (how-to with code and tips) · `diff` (line or word diff, or a git patch) · `math` (KaTeX, worked solutions) |
| **Data & status** | `table` (formatting, inline bars, status/tag columns, totals) · `stats` (KPI tiles with deltas and sparklines) · `progress` · `timeline` · `comparison` · `agenda` · `status_page` · `task_board` · `month_calendar` · `stock_quote` · `watchlist` · `sports_score` (scoreboard, box score, key events) · `activity` (goal rings and health metrics) |
| **Charts** | `bar_chart` · `line_chart` · `pie_chart` · `scatter_chart` · `heatmap` · `radar_chart` · `treemap` · `sankey` · `funnel` · `gauge` · `candlestick` · `calendar_heatmap` · `echarts` (raw ECharts option escape hatch) |
| **Media & cards** | `album_card` (now playing, track, album with track list) · `album_grid` (cover collage) · `profile_card` · `weather` · `map` (pins and routes, auto-framed) · `smart_home` (Home Assistant–style device tiles) · `media_card` (movie, show, book, game or podcast) · `occasion` (birthday, holiday or any celebration) |
| **Layout** | `dashboard`: a grid of cards, each rendering any other template |

Each template has a zod schema (exposed to models as JSON Schema), a complete example, and a description of when to use it.

### Backgrounds

`weather`, `world_clock`, `sports_score` and `occasion` draw themed backgrounds: a sky that matches the conditions and time of day, the local hour's sky behind each city, or the two team colors. An `occasion` takes any occasion by name (`"birthday"`, `"Christmas"`, `"Diwali"`, `"retirement"`). With a photo key that name is the photo search, so nothing is hardcoded per holiday. Without one, birthdays, anniversaries and weddings get their own art, and everything else gets a festive design in the `color` you pass (or one picked from the name).

These are generated SVG art by default, so they work offline and cost nothing. To use real photos, set a free `UIOTG_UNSPLASH_ACCESS_KEY` or `UIOTG_PEXELS_API_KEY`. Templates then search for a fitting photo ("Lisbon city", "christmas lights", "soccer stadium") and cache results for six hours. If the search fails, the generated art is used instead. Each of these templates accepts `background`: `auto` (photo when a key is set, otherwise art), `art`, `photo` or `none`, plus `background_url` to supply your own image.

21 more card-style templates accept a photo behind the whole card, set with `background_image_query_keyword` (e.g. `"christmas"` on a Christmas countdown). Single-subject cards (`countdown`, `calendar_date`, `quote`, `notification`, `alarm`, `clock`) search their title when no keyword is given. The rest (`stats`, `agenda`, `timeline`, `key_value`, `profile_card`…) only take a photo when you pass a keyword. Cards stay plain with no photo key, no match, or `background: "none"`. Charts, tables, code and other dense templates never take a photo. The four templates above also accept the keyword to override their own search.

## Setup

Requires Node.js ≥ 22.18 and a Chromium.

```sh
npm install
npx playwright install chromium-headless-shell   # or rely on an installed Google Chrome / Edge
npm test
```

If Playwright's Chromium isn't installed, uiotg falls back to Google Chrome, then Microsoft Edge. You can also point `UIOTG_CHROMIUM_PATH` at any Chrome/Chromium binary.

### Claude Code

This repo ships a `.mcp.json`, so opening the project in Claude Code offers the server automatically. To add it from elsewhere:

```sh
claude mcp add uiotg -- node /absolute/path/to/uiotg/src/cli.ts
```

### Claude Desktop and other MCP clients

```json
{
  "mcpServers": {
    "uiotg": {
      "command": "node",
      "args": ["/absolute/path/to/uiotg/src/cli.ts"],
      "env": { "UIOTG_THEME": "light" }
    }
  }
}
```

Node runs the TypeScript sources directly. `npm run build` also produces `dist/` (with `bin: uiotg`) for publishing.

### Docker / remote hosting

```sh
cp .env.example .env   # set UIOTG_AUTH_TOKEN (and UIOTG_PUBLIC_URL when public)
docker compose up -d --build
# MCP endpoint: http://localhost:8080/mcp  (Authorization: Bearer <token>)
```

`node src/cli.ts serve --http` serves the same Streamable HTTP endpoint without Docker. See [docs/HOSTING.md](docs/HOSTING.md) for VPS + TLS, Cloud Run, Fly.io and client setup (Claude Code, Hermes Agent). [docs/hermes-skill-prompt.md](docs/hermes-skill-prompt.md) is a prompt that has Hermes Agent write a skill for using these tools.

## MCP tools

| Tool | Purpose |
|---|---|
| `visualize` | `{ data, title?, intent? }` → image. Send raw data (a number, text, a list, an object, or rows); uiotg picks the template and says which one and why. |
| `render` | `{ template, data, options? }` → image. Its description carries the full template catalog. |
| `list_templates` | The compact catalog (a few words per template, about 600 tokens for all of them). Filter by `category`; `detailed: true` adds full descriptions and default sizes. The `render` description carries the same catalog, so most agents never need this call. |
| `get_template` | One template's JSON Schema, default size and a complete example. |
| `list_themes` | Presets, saved custom themes, the current default, and a guide to every theme field and where it shows up. |
| `save_theme` | `{ name, theme, make_default? }` → preview image. Saves a custom theme; unreadable ones are rejected with what to fix. |
| `set_default_theme` | `{ name? }`: the theme for every render that doesn't pick one (omit to clear). |
| `delete_theme` | `{ name }`: removes a saved theme. |
| `render_<template>` | Only with `--tools per-template` (or `UIOTG_TOOLS=per-template`): one tool per template with its exact input schema. This trades a longer tool list for zero schema lookups. |

Invalid data never fails silently. The tool returns an error that lists each problem by path (e.g. `series[0].values: Series "iOS" has 5 values but there are 6 categories`), followed by a valid example, so the model can correct itself and retry.

### Smart defaults

- **`visualize` picks the template.** The rules are deterministic and run on the server, with no extra model calls:
  - time column plus measures → line chart (long-format rows are pivoted into one line per group);
  - measures on very different scales → separate charts, never a shared axis;
  - categories with one measure → ranked bars (top 20 for long lists);
  - values that add up to 100% → donut;
  - a few numbers → stat tiles; two numbers → a value and its change;
  - two measures → scatter;
  - a single record → key–value list;
  - anything else → table.

  Number formats ($, %, K/M) are inferred from column names and values. Data that already matches a template's shape is used as-is.
- **`detail` adapts each template** (`options.detail`, default `auto`):
  - **minimal** applies to small images (under ~420 px of content). It drops the subtitle, gridlines and extras, and labels values directly.
  - **rich** applies when there's room and enough data. It adds a summary strip computed from the data: latest value and change, high/low/average, totals and leader share, correlation. Single-series lines also get their high and low points labeled.
  - **standard** applies in between.

  You can always force a level.

### Nothing is ever cut off

Text in uiotg never overflows, gets truncated with an ellipsis, or is hidden. Layouts adapt instead:
- Text wraps, and long words or URLs break rather than overflow.
- Numbers never break across lines. Big numbers shrink their font until they fit.
- Tile grids (stats, covers, devices, task columns) reflow to fewer columns instead of squeezing.
- Chart labels wrap. When they still don't fit around a chart, they become numbered markers with a key (radar axes, sankey nodes, heatmap columns).
- Category labels are angled rather than skipped.
- If content still doesn't fit, the image grows to show all of it, and the tool result says so.

This is enforced by `npm run audit` and the test suite. Each one renders every template with its example, with stress data (very long text and huge numbers), and at a narrow width, then checks in the browser for clipped, truncated, out-of-bounds, overlapping or broken text.

### Render options

| Option | Default | |
|---|---|---|
| `width` | per template | Image width in CSS px (160–2400) |
| `height` | fit content | Fixed height; charts resize their plot to fill it |
| `theme` | saved default, else `light` | A preset, a saved theme's name, or an inline theme object (see [Themes](#themes)) |
| `scale` | `2` | Device pixel ratio (1–3) |
| `format` | `png` | `png` or `jpeg` (`quality` 1–100) |
| `transparent` | `false` | Transparent background (png) |
| `padding` | per template | Outer padding in px |
| `accent` | palette blue | UI accent color (progress, links, highlights) |
| `detail` | `auto` | `minimal`, `standard` or `rich` |

### Themes

Presets: `light`, `dark`, `midnight`, `nord`, `solarized`, `paper` (serif, small corners), `terminal` (monospace, square corners) and `high-contrast` (color-blind-safe chart colors).

Agents can also design their own: an all-pink theme, a blood-red-on-black one, anything that suits the user. A theme is a light or dark `base` plus whatever you want to change. Usually `background`, `text` and `accent` are enough: secondary text, borders, grid lines, chart ramps and the rest are derived from them. Every derived color can still be set (`subtle`, `text_secondary`, `muted`, `grid`, `axis`, `border`, `page`, `series`, `positive`, `negative`, `status`), plus `font` (sans, serif, mono, rounded) and `corners` (sharp, small, default, round). `list_themes` explains where each one shows up.

```jsonc
// save_theme
{ "name": "rose", "make_default": true,
  "theme": { "base": "light", "background": "#fff0f5", "text": "#3b1d2a", "accent": "#e0457b",
             "series": ["#e0457b", "#9b5de5", "#f28482", "#4d908e", "#f9a03f"], "font": "rounded", "corners": "round" } }
```

Saving checks readability. Text without enough contrast (4.5:1 for body text) is rejected with the exact ratios. Look-alike chart colors and faint accents come back as warnings next to a preview image. The same object works inline as `options.theme` to try a theme before saving it. Saved themes and the default live in `UIOTG_THEMES_DIR`. The default chain is: the call's theme, then the saved default, then `UIOTG_THEME`, then `light`. On a server several people share, set `UIOTG_THEMES_READONLY=1` to keep themes usable but not editable.

Run `npm run gallery:themes` to render every template in every preset.

### Environment

| Variable | |
|---|---|
| `UIOTG_THEME`, `UIOTG_SCALE`, `UIOTG_FORMAT` | Defaults for render options (a theme saved as default by an agent wins over `UIOTG_THEME`) |
| `UIOTG_THEMES_DIR` | Where custom themes and the default are saved (default `~/.config/uiotg/themes`) |
| `UIOTG_THEMES_READONLY=1` | Hide the tools that save, delete or change the default theme |
| `UIOTG_OUTPUT_DIR` | Also write every MCP render to this directory and return the file path |
| `UIOTG_TOOLS=per-template` | Expose one typed tool per template |
| `UIOTG_CHROMIUM_PATH` | Explicit browser binary |
| `UIOTG_OFFLINE=1` | Block all network access (remote images fall back to generated placeholders) |
| `UIOTG_LOCALE` | Number formatting locale (default `en-US`) |
| `UIOTG_TILE_URL` | Map tile server, `{z}/{x}/{y}` with optional `{s}` and `{r}` (retina). Default: OpenStreetMap |
| `UIOTG_TILE_ATTRIBUTION` | Attribution shown on maps for a custom tile server |
| `UIOTG_TILE_CONTACT` | Email or URL added to the tile User-Agent (OpenStreetMap asks operators to be reachable) |
| `UIOTG_UNSPLASH_ACCESS_KEY` / `UIOTG_PEXELS_API_KEY` | Optional photo backgrounds (free keys). Without one, backgrounds are generated art |

## CLI

```sh
node src/cli.ts list                                   # template catalog
node src/cli.ts schema bar_chart                       # JSON Schema + example
node src/cli.ts render weather --theme dark --out w.png   # renders the example
node src/cli.ts render table --data @rows.json --width 900
echo '{"quote":"Ship it."}' | node src/cli.ts render quote --data - --out q.png
node src/cli.ts html dashboard --out d.html            # the intermediate HTML document
node src/cli.ts gallery --out gallery                  # every template, light + dark
```

## Library

```ts
import { createRenderer } from 'uiotg';

const renderer = createRenderer();
const { data, width, height } = await renderer.render('stats', {
  items: [{ label: 'Revenue', value: 4_210_000, format: 'currency_compact', delta: 12.5 }],
});
await renderer.close();
```

## How it works

```
tool call ─► zod validation ─► template.render(data, ctx) ─► HTML fragment ─► document (fonts, theme vars, CSS)
                                     │                                              │
                     charts: ECharts SSR → inline SVG                    headless Chromium, JS disabled
                     code/markdown: Shiki, marked                       screenshot of #root ─► PNG/JPEG
```

- **Templates are pure functions** from validated data to an HTML fragment, built with an auto-escaping `html` tagged template. Charts are rendered to SVG on the server with ECharts; its text measurement uses each bundled font's real glyph metrics (`src/core/metrics.ts`), so labels lay out as the browser draws them.
- **One headless Chromium** is launched lazily and shared. Every render gets a fresh browser context with **JavaScript disabled**. Network access is limited to http(s) images, and bundled fonts (Inter, JetBrains Mono) are served from memory. User-supplied markup can only affect layout.
- **Images that fail to load** fall back to a deterministic gradient, because covers and avatars are drawn as layered CSS backgrounds.
- **Auto height**: the page is measured after layout, and the viewport is resized to fit the content. Bitmaps are capped at 7900 px per side.

### Design system

Chart styling follows a fixed set of data-visualization rules:
- A validated, colorblind-safe categorical palette assigned in fixed order, with no more than 8 series.
- Single-hue sequential scales, and diverging scales with a neutral midpoint.
- Thin marks: bars capped at 24 px with 4 px rounded data-ends, 2 px lines, and 2 px surface gaps between segments.
- Hairline solid gridlines.
- A legend for two or more series, with direct end labels only when they don't collide.
- Text never uses series colors.
- Status colors always come with an icon and a label.

Light and dark themes are tuned separately rather than inverted (`src/core/theme.ts`). Presets and custom themes (`src/core/themes.ts`) all build on them. Every color, the font and the corner rounding reach templates as CSS variables (`--surface`, `--accent`, `--on-accent`, `--rk`, `--pill`…), so templates never hardcode them.

## Adding a template

1. Create `src/templates/<category>/<name>.ts`:

   ```ts
   import { z } from 'zod';
   import { html } from '../../core/html.ts';
   import { defineTemplate } from '../../core/types.ts';

   export const badge = defineTemplate({
     id: 'badge',
     title: 'Badge',
     summary: 'status/version pill', // a few words for the catalog
     category: 'text',
     description: 'A single pill-shaped label. Use for statuses and version tags.',
     schema: z.object({ label: z.string().max(40), value: z.string().max(40) }),
     example: { label: 'build', value: 'passing' },
     width: 320,
     css: `.badge{display:inline-flex;border-radius:999px;overflow:hidden;font-weight:600}
           .badge span{padding:6px 12px}.badge .v{background:var(--accent);color:#fff}`,
     render: (d) => html`<div class="badge"><span>${d.label}</span><span class="v">${d.value}</span></div>`,
   });
   ```

2. Add it to `builtinTemplates` in `src/templates/index.ts`.

The tests pick up every registered template automatically. They check that its example validates, that its schema converts to JSON Schema, and that it renders in both themes. You can also register templates at runtime with `new Registry([...builtinTemplates, badge])`.

## Roadmap

- Return interactive HTML (MCP Apps / `ui://` resources) alongside the image. Templates already produce self-contained HTML, which `uiotg html` writes out today.
- Diagram templates (Mermaid) and image annotation.
