import { timingSafeEqual } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readdir, stat, unlink } from 'node:fs/promises';
import { createServer as createHttpServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { join, resolve } from 'node:path';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { Renderer } from './render/renderer.ts';
import { createServer, VERSION, type ServerOptions } from './server.ts';

export interface HttpOptions {
  renderer: Renderer;
  port: number;
  host?: string;
  toolMode?: ServerOptions['toolMode'];
  /** Require `Authorization: Bearer <token>` (or `?token=`) on /mcp and /images. */
  authToken?: string;
  /** Public base URL (e.g. https://uiotg.example.com). When set, renders are also served at /images/<file>. */
  publicUrl?: string;
  /** Where served images are stored. */
  imageDir?: string;
  /** Delete served images after this many hours. */
  imageTtlHours?: number;
}

const MAX_BODY = 8 * 1024 * 1024;
const IMAGE_NAME = /^[a-z0-9_]+-[a-f0-9]{24}\.(png|jpg)$/;

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body));
}

function rpcError(res: ServerResponse, status: number, message: string): void {
  json(res, status, { jsonrpc: '2.0', error: { code: -32000, message }, id: null });
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY) throw new Error('Request body too large');
    chunks.push(chunk as Buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function authorized(req: IncomingMessage, url: URL, token: string | undefined): boolean {
  if (!token) return true;
  const header = req.headers.authorization ?? '';
  const given = header.startsWith('Bearer ') ? header.slice(7) : (url.searchParams.get('token') ?? '');
  const a = Buffer.from(given);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Periodically removes served images older than the TTL. */
function startJanitor(dir: string, ttlHours: number): NodeJS.Timeout {
  const sweep = async () => {
    const cutoff = Date.now() - ttlHours * 3_600_000;
    for (const name of await readdir(dir).catch(() => [] as string[])) {
      const file = join(dir, name);
      const info = await stat(file).catch(() => null);
      if (info && info.mtimeMs < cutoff) await unlink(file).catch(() => {});
    }
  };
  const timer = setInterval(sweep, 15 * 60_000);
  timer.unref();
  return timer;
}

/**
 * Serves MCP over Streamable HTTP at POST /mcp in stateless mode: each request
 * gets a fresh MCP server instance, while all of them share one renderer (and
 * one headless browser). Stateless mode scales horizontally behind any load
 * balancer with no sticky sessions.
 */
export async function startHttpServer(opts: HttpOptions): Promise<Server> {
  const imageDir = opts.publicUrl ? resolve(opts.imageDir ?? '/tmp/uiotg-images') : undefined;
  const publicUrl = opts.publicUrl?.replace(/\/+$/, '');
  if (imageDir) startJanitor(imageDir, opts.imageTtlHours ?? 24);

  const server = createHttpServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    try {
      if (url.pathname === '/healthz') return json(res, 200, { ok: true, name: 'uiotg', version: VERSION });

      if (url.pathname === '/mcp') {
        if (!authorized(req, url, opts.authToken)) return rpcError(res, 401, 'Unauthorized');
        if (req.method !== 'POST') return rpcError(res, 405, 'Method not allowed: this server is stateless, use POST');
        let body: unknown;
        try {
          body = await readJson(req);
        } catch (err) {
          return rpcError(res, 400, `Bad request: ${(err as Error).message}`);
        }
        const mcp = createServer({
          renderer: opts.renderer,
          toolMode: opts.toolMode,
          outputDir: imageDir,
          imageBaseUrl: publicUrl ? `${publicUrl}/images` : undefined,
        });
        const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
        res.on('close', () => {
          void transport.close();
          void mcp.close();
        });
        await mcp.connect(transport);
        await transport.handleRequest(req, res, body);
        return;
      }

      if (imageDir && req.method === 'GET' && url.pathname.startsWith('/images/')) {
        const name = url.pathname.slice('/images/'.length);
        // Image names carry 96 random bits, so the URL itself is the capability; no token needed to view.
        if (!IMAGE_NAME.test(name)) return json(res, 404, { error: 'Not found' });
        const file = join(imageDir, name);
        const info = await stat(file).catch(() => null);
        if (!info) return json(res, 404, { error: 'Not found or expired' });
        res.writeHead(200, {
          'content-type': name.endsWith('.jpg') ? 'image/jpeg' : 'image/png',
          'content-length': info.size,
          'cache-control': 'public, max-age=86400, immutable',
        });
        createReadStream(file).pipe(res);
        return;
      }

      json(res, 404, { error: 'Not found' });
    } catch (err) {
      if (!res.headersSent) rpcError(res, 500, (err as Error).message);
      else res.end();
    }
  });

  await new Promise<void>((done) => server.listen(opts.port, opts.host ?? '0.0.0.0', done));
  return server;
}
