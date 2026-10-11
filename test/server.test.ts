import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRenderer, createServer, ThemeStore } from '../src/index.ts';

const themes = new ThemeStore(mkdtempSync(join(tmpdir(), 'uiotg-themes-')));
const renderer = createRenderer({ browser: { allowNetwork: false }, themes });

async function connect(toolMode: 'single' | 'per-template' = 'single'): Promise<Client> {
  const server = createServer({ renderer, toolMode });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test', version: '0.0.0' });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

describe('MCP server', () => {
  let client: Client;
  before(async () => {
    client = await connect();
  });
  after(async () => {
    await client.close();
    await renderer.close();
  });

  test('exposes the core tools with instructions', async () => {
    const { tools } = await client.listTools();
    assert.deepEqual(tools.map((t) => t.name).sort(), [
      'delete_theme',
      'get_template',
      'list_templates',
      'list_themes',
      'render',
      'save_theme',
      'set_default_theme',
      'visualize',
    ]);
    const render = tools.find((t) => t.name === 'render')!;
    assert.match(render.description ?? '', /bar_chart/);
    const props = render.inputSchema.properties as Record<string, { enum?: string[] }>;
    assert.ok(props.template?.enum?.includes('album_card'));
    assert.match(client.getInstructions() ?? '', /get_template/);
  });

  test('saves a custom theme, makes it the default and deletes it', async () => {
    const theme = { base: 'light', background: '#fff0f5', text: '#3b1d2a', accent: '#e0457b' };
    const saved = (await client.callTool({ name: 'save_theme', arguments: { name: 'rose', theme, make_default: true } })) as CallToolResult;
    assert.ok(!saved.isError, JSON.stringify(saved.content));
    assert.equal(saved.content[0]!.type, 'image');
    assert.equal(themes.getDefault(), 'rose');
    // Renders that don't pick a theme now use it.
    const doc = await renderer.toHtml('stats', { items: [{ label: 'A', value: 1 }] });
    assert.match(doc.html, /--surface:#fff0f5/);
    const list = (await client.callTool({ name: 'list_themes', arguments: {} })) as CallToolResult;
    assert.match((list.content[0] as { text: string }).text, /Default theme: rose[\s\S]*Saved themes: rose/);
    const del = (await client.callTool({ name: 'delete_theme', arguments: { name: 'rose' } })) as CallToolResult;
    assert.ok(!del.isError);
    assert.equal(themes.getDefault(), undefined);
  });

  test('rejects an unreadable theme with what to fix', async () => {
    const res = (await client.callTool({ name: 'save_theme', arguments: { name: 'pinkpink', theme: { background: '#ffc0cb', text: '#ff69b4' } } })) as CallToolResult;
    assert.ok(res.isError);
    assert.match((res.content[0] as { text: string }).text, /text on background .* needs 4.5:1/);
    assert.deepEqual(themes.names(), []);
  });

  test('read-only servers hide the theme-writing tools', async () => {
    const server = createServer({ renderer, readOnlyThemes: true });
    const [a, b] = InMemoryTransport.createLinkedPair();
    const c = new Client({ name: 'test', version: '0.0.0' });
    await Promise.all([server.connect(b), c.connect(a)]);
    const names = (await c.listTools()).tools.map((t) => t.name);
    assert.ok(names.includes('list_themes') && !names.includes('save_theme') && !names.includes('delete_theme'));
    await c.close();
  });

  test('visualize picks a template for raw rows and explains it', async () => {
    const res = (await client.callTool({
      name: 'visualize',
      arguments: {
        data: [{ day: 'Mon', orders: 120 }, { day: 'Tue', orders: 135 }, { day: 'Wed', orders: 128 }, { day: 'Thu', orders: 160 }],
        title: 'Orders this week',
        options: { scale: 1 },
      },
    })) as CallToolResult;
    assert.ok(!res.isError, JSON.stringify(res.content));
    const text = res.content.map((c) => (c.type === 'text' ? c.text : '')).join('\n');
    assert.match(text, /Chose line_chart/);
    assert.ok(res.content.some((c) => c.type === 'image'));
  });

  test('list_templates filters by category', async () => {
    const res = (await client.callTool({ name: 'list_templates', arguments: { category: 'media' } })) as CallToolResult;
    const text = (res.content[0] as { text: string }).text;
    assert.match(text, /album_card/);
    assert.doesNotMatch(text, /bar_chart/);
  });

  test('get_template returns schema and example', async () => {
    const res = (await client.callTool({ name: 'get_template', arguments: { template: 'line_chart' } })) as CallToolResult;
    const info = JSON.parse((res.content[0] as { text: string }).text);
    assert.equal(info.id, 'line_chart');
    assert.equal(info.data_schema.type, 'object');
    assert.ok(info.data_schema.required.includes('series'));
    assert.ok(Array.isArray(info.example.series));
  });

  test('render returns an image', async () => {
    const res = (await client.callTool({
      name: 'render',
      arguments: { template: 'stats', data: { items: [{ label: 'Revenue', value: 4200, format: 'currency' }] }, options: { scale: 1 } },
    })) as CallToolResult;
    assert.ok(!res.isError);
    const image = res.content.find((c) => c.type === 'image') as { data: string; mimeType: string };
    assert.equal(image.mimeType, 'image/png');
    assert.equal(Buffer.from(image.data, 'base64').subarray(1, 4).toString(), 'PNG');
  });

  test('invalid data returns a fixable error with an example', async () => {
    const res = (await client.callTool({
      name: 'render',
      arguments: { template: 'pie_chart', data: { slices: [{ label: 'A' }] } },
    })) as CallToolResult;
    assert.equal(res.isError, true);
    const text = (res.content[0] as { text: string }).text;
    assert.match(text, /slices\[0\]\.value/);
    assert.match(text, /Example of valid data/);
  });

  test('per-template mode adds typed tools', async () => {
    const typed = await connect('per-template');
    const { tools } = await typed.listTools();
    assert.ok(tools.some((t) => t.name === 'render_weather'));
    const res = (await typed.callTool({
      name: 'render_quote',
      arguments: { data: { quote: 'Typed tools work.' }, options: { scale: 1 } },
    })) as CallToolResult;
    assert.ok(!res.isError, JSON.stringify(res.content));
    assert.ok(res.content.some((c) => c.type === 'image'));
    await typed.close();
  });
});
