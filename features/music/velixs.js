import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const DEFAULT_API_URL = "https://api.velixs.com/v1/aio-downloader";
const DEFAULT_USER_AGENT = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/**
 * Build the Velixs aio-downloader request URL for an audio/mp3 download.
 */
export function buildVelixsRequestUrl(songUrl, {
  apiUrl = DEFAULT_API_URL,
  apiKey = "",
  quality = "256KBPS",
} = {}) {
  if (!songUrl) throw new Error("YouTube song URL missing");
  if (!apiKey) throw new Error("VELIXS_API_KEY belum diatur.");

  const endpoint = new URL(apiUrl || DEFAULT_API_URL);
  endpoint.searchParams.set("apikey", apiKey);
  endpoint.searchParams.set("url", songUrl);
  endpoint.searchParams.set("format", "mp3");
  endpoint.searchParams.set("type", "audio");
  if (quality) endpoint.searchParams.set("quality", quality);
  return endpoint.toString();
}

/**
 * Query Velixs API to resolve media metadata and the direct MP3 download URL.
 */
export async function resolveVelixsAudio(songUrl, {
  apiUrl = DEFAULT_API_URL,
  apiKey = "",
  quality = "256KBPS",
  fetchFn = globalThis.fetch,
  timeoutMs = 30_000,
} = {}) {
  const requestUrl = buildVelixsRequestUrl(songUrl, { apiUrl, apiKey, quality });
  const response = await fetchFn(requestUrl, {
    headers: {
      "User-Agent": DEFAULT_USER_AGENT,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    await response.body?.cancel?.().catch(() => {});
    throw new Error(`Velixs API HTTP ${response.status}`);
  }

  const payload = await response.json();
  const downloadUrl = payload?.data?.selected?.download_url;
  if (!payload?.success || !downloadUrl) {
    throw new Error(payload?.message || "Velixs API tidak mengembalikan download_url.");
  }

  return {
    title: typeof payload.data?.title === "string" ? payload.data.title.trim() : "",
    duration: Number.isFinite(Number(payload.data?.duration)) ? Number(payload.data.duration) : null,
    thumbnail: typeof payload.data?.thumbnail === "string" ? payload.data.thumbnail : null,
    downloadUrl,
    format: payload.data?.selected?.format || "mp3",
    quality: payload.data?.selected?.quality || quality,
  };
}

/**
 * Download the resolved audio URL to a temporary file and return a readable stream
 * that deletes the temporary file once playback finishes or errors out.
 */
export async function downloadVelixsStream(songUrl, {
  apiUrl = DEFAULT_API_URL,
  apiKey = "",
  quality = "256KBPS",
  fetchFn = globalThis.fetch,
  tempDir = os.tmpdir(),
  timeoutMs = 60_000,
  onMetadata = null,
  resolved: preResolved = null,
} = {}) {
  const resolved = preResolved?.downloadUrl
    ? preResolved
    : await resolveVelixsAudio(songUrl, {
        apiUrl,
        apiKey,
        quality,
        fetchFn,
        timeoutMs: Math.min(timeoutMs, 30_000),
      });

  if (typeof onMetadata === "function") {
    onMetadata(resolved);
  }

  const ext = String(resolved.format || "mp3").replace(/[^a-z0-9]/giu, "") || "mp3";
  const tempPath = path.join(tempDir, `vibes-velixs-${randomBytes(8).toString("hex")}.${ext}`);

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    void fsp.unlink(tempPath).catch(() => {});
  };

  try {
    const response = await fetchFn(resolved.downloadUrl, {
      headers: {
        "User-Agent": DEFAULT_USER_AGENT,
      },
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok || !response.body) {
      await response.body?.cancel?.().catch(() => {});
      throw new Error(`Velixs download HTTP ${response.status}`);
    }

    const bodyStream = typeof response.body.getReader === "function"
      ? Readable.fromWeb(response.body)
      : response.body;

    await pipeline(bodyStream, fs.createWriteStream(tempPath));

    const fileStream = fs.createReadStream(tempPath);
    fileStream.once("close", cleanup);
    fileStream.once("end", cleanup);
    fileStream.once("error", cleanup);
    return fileStream;
  } catch (error) {
    cleanup();
    throw error;
  }
}
