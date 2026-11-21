import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

export type Handler = (req: Request) => Response | Promise<Response>;

export async function toRequest(req: IncomingMessage, res: ServerResponse): Promise<Request> {
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers))
    if (v !== undefined) headers.set(k, Array.isArray(v) ? v.join(", ") : v);
  const method = req.method ?? "GET";
  const chunks: Buffer[] = [];
  if (method !== "GET" && method !== "HEAD")
    for await (const chunk of req) chunks.push(chunk as Buffer);
  const abort = new AbortController();
  res.once("close", () => abort.abort());
  return new Request(`http://${req.headers.host ?? "127.0.0.1"}${req.url ?? "/"}`, {
    method,
    headers,
    body: chunks.length ? Buffer.concat(chunks) : undefined,
    signal: abort.signal,
  });
}

export async function sendResponse(response: Response, res: ServerResponse): Promise<void> {
  const headers: Record<string, string | string[]> = {};
  response.headers.forEach((value, key) => {
    headers[key] = key === "set-cookie" ? response.headers.getSetCookie() : value;
  });
  res.writeHead(response.status, headers);
  if (!response.body) {
    res.end();
    return;
  }
  const reader = response.body.getReader();
  res.once("close", () => void reader.cancel().catch(() => {}));
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      if (!res.write(value))
        await new Promise<void>((resolve) =>
          res.once("drain", () => resolve()).once("close", () => resolve()),
        );
      if (res.destroyed) break;
    }
  } catch {
  } finally {
    res.end();
  }
}

export function handlerServer(handler: Handler): Server {
  return createServer((req, res) => {
    void (async () => {
      try {
        await sendResponse(await handler(await toRequest(req, res)), res);
      } catch (e) {
        if (!res.headersSent) res.writeHead(500, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: String((e as Error)?.message ?? e).slice(0, 300) }));
      }
    })();
  });
}

export async function listen(server: Server, port: number): Promise<number> {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  return (server.address() as AddressInfo).port;
}

export function stopServer(server: Server): void {
  server.close();
  server.closeAllConnections();
}
