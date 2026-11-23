import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { parseStreamProvider, validateRuntimeConfig } from "../core/config.js";
import { buildVelixsRequestUrl, downloadVelixsStream } from "../features/music/velixs.js";

test("parseStreamProvider accepts ytdl/velixs and rejects invalid values", () => {
  assert.equal(parseStreamProvider(undefined), "ytdl");
  assert.equal(parseStreamProvider(""), "ytdl");
  assert.equal(parseStreamProvider("velixs"), "velixs");
  assert.equal(parseStreamProvider(" YTDL "), "ytdl");
  assert.throws(() => parseStreamProvider("invalid"), /ytdl.*velixs/u);
});

test("validateRuntimeConfig requires VELIXS_API_KEY when velixs provider is active", () => {
  assert.throws(
    () => validateRuntimeConfig({
      requireToken: true,
      currentConfig: {
        token: "bot-token",
        clientId: "123",
        dashboardEnabled: false,
        youtubeStreamProvider: "velixs",
        velixsApiKey: "",
      },
    }),
    /VELIXS_API_KEY/u,
  );

  assert.doesNotThrow(() => validateRuntimeConfig({
    requireToken: true,
    currentConfig: {
      token: "bot-token",
      clientId: "123",
      dashboardEnabled: false,
      youtubeStreamProvider: "velixs",
      velixsApiKey: "secret-key",
    },
  }));
});

test("buildVelixsRequestUrl encodes mp3 audio query parameters", () => {
  const url = new URL(buildVelixsRequestUrl("https://www.youtube.com/watch?v=2VHqBJqs3_g", {
    apiUrl: "https://api.velixs.com/v1/aio-downloader",
    apiKey: "test-key",
    quality: "256KBPS",
  }));

  assert.equal(url.origin + url.pathname, "https://api.velixs.com/v1/aio-downloader");
  assert.equal(url.searchParams.get("apikey"), "test-key");
  assert.equal(url.searchParams.get("url"), "https://www.youtube.com/watch?v=2VHqBJqs3_g");
  assert.equal(url.searchParams.get("format"), "mp3");
  assert.equal(url.searchParams.get("type"), "audio");
  assert.equal(url.searchParams.get("quality"), "256KBPS");
});

test("downloadVelixsStream downloads audio to temp file, streams it, and cleans up", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vibes-velixs-test-"));
  const audioBytes = Buffer.from("ID3-fake-mp3-payload");
  let metadataSeen = null;

  const mockFetch = async (url) => {
    if (String(url).includes("/v1/aio-downloader")) {
      return new Response(JSON.stringify({
        success: true,
        data: {
          title: "Test Track",
          duration: 120,
          selected: {
            format: "mp3",
            quality: "256KBPS",
            download_url: "https://api.velixs.com/link/proxy/abc.mp3",
          },
        },
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response(audioBytes, { status: 200, headers: { "content-type": "audio/mpeg" } });
  };

  try {
    const stream = await downloadVelixsStream("https://www.youtube.com/watch?v=abc", {
      apiKey: "test-key",
      fetchFn: mockFetch,
      tempDir,
      onMetadata: (meta) => {
        metadataSeen = meta;
      },
    });

    const chunks = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }

    assert.equal(Buffer.concat(chunks).toString(), audioBytes.toString());
    assert.equal(metadataSeen?.title, "Test Track");

    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.deepEqual(fs.readdirSync(tempDir), []);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("downloadVelixsStream cleans up and throws when download returns HTTP error", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vibes-velixs-err-"));
  const mockFetch = async (url) => {
    if (String(url).includes("/v1/aio-downloader")) {
      return new Response(JSON.stringify({
        success: true,
        data: {
          selected: { download_url: "https://api.velixs.com/link/proxy/fail.mp3" },
        },
      }), { status: 200 });
    }
    return new Response("Forbidden", { status: 403 });
  };

  try {
    await assert.rejects(
      () => downloadVelixsStream("https://www.youtube.com/watch?v=abc", {
        apiKey: "test-key",
        fetchFn: mockFetch,
        tempDir,
      }),
      /Velixs download HTTP 403/u,
    );
    assert.deepEqual(fs.readdirSync(tempDir), []);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
