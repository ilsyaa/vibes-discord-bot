import { ProxyAgent, fetch as undiciFetch } from 'undici';

const FAILURE_STATUSES = new Set([403, 429, 500, 502, 503, 504]);
const MAX_WAIT_SLICE_MS = 1_000;

export function parseProxyList(source) {
  const values = Array.isArray(source) ? source : String(source || '').split(/\r?\n/u);
  const entries = [];
  const seen = new Set();

  values.forEach((value, index) => {
    const candidate = String(value).trim();
    if (!candidate || candidate.startsWith('#')) return;

    const entry = parseProxyEntry(candidate, index + 1);
    if (seen.has(entry.uri)) return;
    seen.add(entry.uri);
    entries.push(entry);
  });

  return entries;
}

function parseProxyEntry(value, lineNumber) {
  try {
    const uri = value.includes('://') ? new URL(value) : tupleToUrl(value);
    if (!['http:', 'https:'].includes(uri.protocol)) {
      throw new Error('only http and https proxies are supported');
    }
    if (!uri.hostname || !uri.port) throw new Error('host and port are required');

    return {
      uri: uri.toString(),
      label: `${uri.hostname}:${uri.port}`,
    };
  } catch (error) {
    throw new Error(`Invalid YouTube proxy entry on line ${lineNumber}: ${error.message}`);
  }
}

function tupleToUrl(value) {
  const parts = value.split(':');
  if (parts.length < 4) throw new Error('expected host:port:username:password or a proxy URL');

  const [host, port, username, ...passwordParts] = parts;
  if (!host || !/^\d{1,5}$/u.test(port) || !username || passwordParts.length === 0) {
    throw new Error('expected host:port:username:password');
  }

  const url = new URL(`http://${host}:${port}`);
  url.username = username;
  url.password = passwordParts.join(':');
  return url;
}

export class ProxyPool {
  #entries;
  #cooldownMs;
  #failureCooldownMs;
  #now;
  #fetch;
  #cursor = 0;

  constructor({
    proxies = [],
    cooldownMs = 60_000,
    failureCooldownMs = 10 * 60_000,
    fetch = undiciFetch,
    agentFactory = (uri) => new ProxyAgent(uri),
    now = () => Date.now(),
  } = {}) {
    if (!Number.isInteger(cooldownMs) || cooldownMs < 1_000) {
      throw new Error('Proxy cooldown must be at least 1000 milliseconds');
    }
    if (!Number.isInteger(failureCooldownMs) || failureCooldownMs < cooldownMs) {
      throw new Error('Proxy failure cooldown must be at least the normal cooldown');
    }

    this.#entries = parseProxyList(proxies).map((proxy) => ({
      ...proxy,
      agent: agentFactory(proxy.uri),
      availableAt: 0,
      busy: false,
      uses: 0,
      failures: 0,
    }));
    this.#cooldownMs = cooldownMs;
    this.#failureCooldownMs = failureCooldownMs;
    this.#now = now;
    this.#fetch = fetch;
  }

  get size() {
    return this.#entries.length;
  }

  get enabled() {
    return this.#entries.length > 0;
  }

  async fetch(input, init = {}) {
    if (!this.enabled) return this.#fetch(input, init);

    const lease = await this.#acquire(init.signal);
    try {
      const response = await this.#fetch(input, { ...init, dispatcher: lease.entry.agent });
      return this.#trackResponse(response, lease);
    } catch (error) {
      this.#release(lease.entry, error);
      throw error;
    }
  }

  snapshot() {
    const now = this.#now();
    return {
      total: this.#entries.length,
      available: this.#entries.filter((entry) => !entry.busy && entry.availableAt <= now).length,
      busy: this.#entries.filter((entry) => entry.busy).length,
      coolingDown: this.#entries.filter((entry) => !entry.busy && entry.availableAt > now).length,
      failures: this.#entries.reduce((total, entry) => total + entry.failures, 0),
    };
  }

  async close() {
    await Promise.all(
      this.#entries.map((entry) => (typeof entry.agent.close === 'function' ? entry.agent.close() : undefined)),
    );
  }

  async #acquire(signal) {
    while (true) {
      const now = this.#now();
      for (let offset = 0; offset < this.#entries.length; offset += 1) {
        const index = (this.#cursor + offset) % this.#entries.length;
        const entry = this.#entries[index];
        if (entry.busy || entry.availableAt > now) continue;

        entry.busy = true;
        entry.uses += 1;
        this.#cursor = (index + 1) % this.#entries.length;
        return { entry };
      }

      const nextAvailableAt = Math.min(
        ...this.#entries.map((entry) => (entry.busy ? now + MAX_WAIT_SLICE_MS : entry.availableAt)),
      );
      await waitForSignal(Math.max(25, Math.min(nextAvailableAt - now, MAX_WAIT_SLICE_MS)), signal);
    }
  }

  #trackResponse(response, lease) {
    if (!response.body) {
      this.#release(lease.entry, statusFailure(response.status));
      return response;
    }

    const reader = response.body.getReader();
    let released = false;
    const release = (error) => {
      if (released) return;
      released = true;
      this.#release(lease.entry, error);
    };
    const body = new ReadableStream({
      async pull(controller) {
        try {
          const result = await reader.read();
          if (result.done) {
            release(statusFailure(response.status));
            controller.close();
          } else {
            controller.enqueue(result.value);
          }
        } catch (error) {
          release(error);
          controller.error(error);
        }
      },
      async cancel(reason) {
        release(statusFailure(response.status) || reason);
        await reader.cancel(reason);
      },
    });

    return new Response(body, {
      headers: response.headers,
      status: response.status,
      statusText: response.statusText,
    });
  }

  #release(entry, error) {
    entry.busy = false;
    const failed = Boolean(error);
    if (failed) entry.failures += 1;
    entry.availableAt = this.#now() + (failed ? this.#failureCooldownMs : this.#cooldownMs);
  }
}

function statusFailure(status) {
  return FAILURE_STATUSES.has(status) ? new Error(`Proxy request returned HTTP ${status}`) : undefined;
}

function waitForSignal(delayMs, signal) {
  if (signal?.aborted) return Promise.reject(signal.reason);

  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, delayMs);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });
}
