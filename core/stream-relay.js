import { randomBytes } from 'node:crypto';
import http from 'node:http';

const DEFAULT_TTL_MS = 30 * 60_000;

export async function createStreamRelay({
  createStream,
  onError = () => {},
  host = '127.0.0.1',
  port = 0,
  ttlMs = DEFAULT_TTL_MS,
} = {}) {
  if (typeof createStream !== 'function') throw new TypeError('createStream must be a function');
  if (!Number.isInteger(ttlMs) || ttlMs < 1_000) throw new Error('Stream relay TTL must be at least 1000 milliseconds');

  const entries = new Map();
  const server = http.createServer((request, response) => {
    void handleRequest(request, response);
  });

  await new Promise((resolve, reject) => {
    const onErrorOnce = (error) => {
      server.off('listening', onListening);
      reject(error);
    };
    const onListening = () => {
      server.off('error', onErrorOnce);
      resolve();
    };
    server.once('error', onErrorOnce);
    server.once('listening', onListening);
    server.listen(port, host);
  });

  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Stream relay did not receive a TCP address');
  const baseUrl = `http://${host}:${address.port}`;

  function register(source) {
    if (!source) throw new Error('Stream relay source is required');

    const token = randomBytes(24).toString('base64url');
    const entry = {
      source,
      stream: null,
      timer: setTimeout(() => {
        entry.stream?.destroy();
        entries.delete(token);
      }, ttlMs),
    };
    entry.timer.unref?.();
    entries.set(token, entry);
    return `${baseUrl}/stream/${token}`;
  }

  async function handleRequest(request, response) {
    if (request.method !== 'GET') {
      response.writeHead(405, { Allow: 'GET' });
      response.end();
      return;
    }

    const token = /^\/stream\/([^/]+)$/u.exec(new URL(request.url || '/', baseUrl).pathname)?.[1];
    const entry = token ? entries.get(token) : null;
    if (!entry) {
      response.writeHead(404);
      response.end();
      return;
    }
    if (entry.stream) {
      response.writeHead(409);
      response.end();
      return;
    }

    let stream;
    try {
      stream = await createStream(entry.source);
      entry.stream = stream;
      response.writeHead(200, {
        'Cache-Control': 'no-store',
        'Content-Type': 'application/octet-stream',
      });
      stream.on('error', (error) => {
        onError(error);
        if (!response.destroyed) response.destroy(error);
      });
      response.once('finish', () => removeEntry(token, entry));
      response.once('close', () => {
        entry.stream = null;
        if (!response.writableFinished) stream.destroy();
      });
      stream.pipe(response);
    } catch (error) {
      onError(error);
      response.writeHead(502);
      response.end('stream unavailable');
      entry.stream = null;
    }
  }

  function removeEntry(token, entry) {
    clearTimeout(entry.timer);
    if (entries.get(token) === entry) entries.delete(token);
  }

  return {
    register,
    async close() {
      for (const [token, entry] of entries) {
        clearTimeout(entry.timer);
        entry.stream?.destroy();
        entries.delete(token);
      }
      if (!server.listening) return;
      await new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    },
    url: baseUrl,
  };
}
