You have a new MCP server called **uiotg** ("User Interface On The Go"). Its tools are `mcp_uiotg_list_templates`, `mcp_uiotg_get_template` and `mcp_uiotg_render`. It turns structured data into polished UI images: charts, tables, KPI tiles, timelines, code snippets, album art, weather cards, profile cards and multi-panel dashboards. I want you to create a reusable skill that teaches you to use it well. Base the skill on what the tools actually return, not on assumptions.

**Step 1: Learn the tool.**
- Call `mcp_uiotg_list_templates` to get the full catalog.
- Call `mcp_uiotg_get_template` for every template. Note its required fields, its optional fields that matter, and anything that's easy to get wrong.
- Easy-to-get-wrong details include:
  - `format: "percent"` expects fractions, while `{"suffix":"%"}` is for values that are already percentages;
  - series value arrays must match the length of `categories`/`x`;
  - `stats` deltas are percentages by default;
  - `good_when: "down"` is for metrics where lower is better.

**Step 2: Render-test before you write anything down.**
- Call `mcp_uiotg_render` at least once per template category (text, data, chart, media, layout), including one `dashboard` that combines 3+ templates.
- Deliberately send one invalid payload and observe the error format, so the skill can say how to recover. Errors list issues by field path and include a valid example.
- Note what the result contains: an inline image, a text line with the size, and, when the server has a public URL, a `URL: https://…/images/…png` line.

**Step 3: Write the skill.** Create it with your skill-management tooling as a SKILL.md skill named `uiotg-visuals`. The frontmatter description should make it trigger whenever a user asks to visualize, chart, plot, summarize visually, make a card/image/dashboard of some data, or when a reply would be clearer as a picture than as text (comparisons, trends, schedules, rankings, status reports). The body should cover:
1. **When to use it, and when not to.** Prefer an image when there are numbers to compare or trends to see, or when the user will forward the output. Prefer plain text for a single short fact, unless the user asked for a visual.
2. **The workflow.** Pick a template, fetch its schema with `get_template` if you haven't used it in this session, shape the data, render, and check the result. On error, fix the reported paths and retry once.
3. **A template picker table.** Map user intent to template: trend over time → `line_chart`, ranking/breakdown → `bar_chart`, one headline number → `stats` (not a chart), part-to-whole → `pie_chart` (≤ 6 slices), a few numbers plus a chart → `dashboard`, music/album/now playing → `album_card`/`album_grid`, forecast → `weather`, plan/incident history → `timeline`, options → `comparison`, code → `code`, long notes → `markdown`.
4. **Data-shaping rules:**
   - at most 8 series; fold the rest into "Other";
   - never two y-axes; make two charts in a dashboard instead;
   - a one-bar chart or two-slice pie should be a `stats` tile;
   - use `highlight` to emphasize one category;
   - use `sort: "desc"` for rankings;
   - set `format` so axes and values read naturally ($4.2M, 12.9K, 25%);
   - give every chart a `title`, plus a `subtitle` with units and the time range.
5. **Options.**
   - `theme: "dark"` when the user prefers dark mode or the destination is dark;
   - `width` for wide data;
   - a fixed `height` only when a layout requires it;
   - `scale: 1` when image size matters.
6. **Delivering the result.**
   - In chat UIs, the inline image is enough.
   - On messaging platforms (Telegram, Discord, Slack, etc.), or when the user wants a link or file, use the `URL:` line from the result.
   - Always add one or two sentences of insight under the image, never just the picture.
7. **Three or four complete, verified example payloads** copied from calls that rendered successfully in Step 2. Include the dashboard.

**Step 4: Prove it works.** Load the new skill and use it to answer these three requests, sending me the images:
- "How did our weekly signups trend? Mon 120, Tue 135, Wed 128, Thu 160, Fri 172, Sat 90, Sun 85, vs last week 110/118/125/140/150/88/80"
- "Show me a status dashboard: uptime 99.95%, p95 latency 212 ms (up 6% — bad), 3 open incidents, plus a checklist of this week's launches"
- "Make a now-playing card for 'Neon Platform' by The Night Lines, 1:24 of 4:05"

If anything in the skill was wrong or missing during this test, fix the skill. Then tell me where it was saved and summarize what it covers.
