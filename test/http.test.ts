import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { createRenderer, startHttpServer } from '../src/index.ts';

const TOKEN = 'test-token-123';
const renderer = createRenderer({ browser: { allowNetwork: false } });

describe('HTTP transport', () => {
  let base: string;
  let imageDir: string;
  let close: () => Promise<void>;

  before(async () => {
    imageDir = await mkdtemp(join(tmpdir(), 'uiotg-'));
    const server = await startHttpServer({ renderer, port: 0, host: '127.0.0.1', authToken: TOKEN, publicUrl: 'http://placeholder', imageDir });
    const { port } = server.address() as AddressInfo;
    base = `http://127.0.0.1:${port}`;
    close = () => new Promise((done) => server.close(() => done()));
  });

  after(async () => {
    await close();
    await renderer.close();
    await rm(imageDir, { recursive: true, force: true });
  });

  test('health check is open', async () => {
    const res = await fetch(`${base}/healthz`);
    assert.equal(res.status, 200);
    assert.equal((await res.json()).ok, true);
  });

  test('rejects requests without the token', async () => {
    const res = await fetch(`${base}/mcp`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    assert.equal(res.status, 401);
  });

  test('serves MCP and returns an image plus a public URL', async () => {
    const client = new Client({ name: 'test', version: '0.0.0' });
    await client.connect(
      new StreamableHTTPClientTransport(new URL(`${base}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${TOKEN}` } } }),
    );
    const { tools } = await client.listTools();
    assert.ok(tools.some((t) => t.name === 'render'));
    const res = (await client.callTool({
      name: 'render',
      arguments: { template: 'gauge', data: { value: 42, label: 'CPU' }, options: { scale: 1 } },
    })) as CallToolResult;
    assert.ok(res.content.some((c) => c.type === 'image'));
    const text = res.content.map((c) => (c.type === 'text' ? c.text : '')).join('\n');
    const url = /URL: http:\/\/placeholder(\/images\/\S+)/.exec(text)?.[1];
    assert.ok(url, text);
    const img = await fetch(`${base}${url}`);
    assert.equal(img.status, 200);
    assert.equal(img.headers.get('content-type'), 'image/png');
    await client.close();
  });

  test('image paths cannot escape the image directory', async () => {
    const res = await fetch(`${base}/images/..%2F..%2Fetc%2Fpasswd`);
    assert.equal(res.status, 404);
  });
});
