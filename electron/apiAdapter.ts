/**
 * Bridges the custom `app://` protocol to server/fileApi.ts without a localhost listener.
 *
 * `handleApi` is written against node:http, but it only ever touches a handful of members:
 * `req.url`, `req.method`, `req.on('data' | 'end' | 'error')`, and on the response
 * `statusCode`, `setHeader()` and `end()`. Faking exactly those keeps fileApi.ts byte-for-byte
 * identical between the Vite dev server and the packaged app.
 */
import { EventEmitter } from 'node:events';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { type ApiContext, handleApi } from '../server/fileApi';

export type { ApiContext };

/** Run one WHATWG Request through handleApi and collect its reply. */
export async function handleApiRequest(request: Request, ctx: ApiContext): Promise<Response> {
  const url = new URL(request.url);
  // handleApi matches on `${method} ${pathname}` against bare routes (/project, /file, /pick):
  // in dev the Vite middleware is mounted at /api and strips that prefix, so strip it here too.
  const pathname = url.pathname.startsWith('/api') ? url.pathname.slice('/api'.length) || '/' : url.pathname;

  // Read the body before starting handleApi: readJson() attaches its listeners synchronously,
  // so the emit below must not be interleaved with an await.
  const body = request.body ? new Uint8Array(await request.arrayBuffer()) : null;

  const req = new EventEmitter() as EventEmitter & Pick<IncomingMessage, 'url' | 'method'>;
  req.url = pathname + url.search;
  req.method = request.method;

  const headers = new Headers();
  let settle!: (r: Response) => void;
  const response = new Promise<Response>((resolve) => {
    settle = resolve;
  });
  const res = {
    statusCode: 200,
    setHeader(name: string, value: string): void {
      headers.set(name, value);
    },
    /** fileApi's send() always ends with a JSON string, so a string body is the whole contract. */
    end(chunk?: string): void {
      settle(new Response(chunk ?? null, { status: res.statusCode, headers }));
    },
  };

  handleApi(req as unknown as IncomingMessage, res as unknown as ServerResponse, ctx).catch((e: unknown) => {
    settle(Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 }));
  });

  if (body) req.emit('data', body);
  req.emit('end');
  return response;
}
