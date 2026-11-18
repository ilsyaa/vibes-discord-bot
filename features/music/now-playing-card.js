import { createCanvas, loadImage } from '@napi-rs/canvas';

/**
 * Now-playing card renderer.
 *
 * Layout is measured, not hardcoded: the card grows when a title wraps or when
 * the statistic chips overflow, so long YouTube titles never get clipped.
 */

const WIDTH = 900;
const PAD = 28;
const ART_SIZE = 196;
const GAP = 28;
const RADIUS = 24;
const TITLE_FONT = '700 34px sans-serif';
const ARTIST_FONT = '500 18px sans-serif';
const LABEL_FONT = '700 12px sans-serif';
const TIME_FONT = '600 13px sans-serif';
const CHIP_FONT = '600 13px sans-serif';

const COVER_CACHE = new Map();
const COVER_CACHE_LIMIT = 64;

export const CARD_FILENAME = 'now-playing.png';

export async function renderNowPlayingCard(queue, song) {
  const cover = await loadCover(song?.thumbnail);
  const measure = createCanvas(10, 10).getContext('2d');
  const meta = buildLayout(measure, queue, song);

  const height = Math.ceil(meta.height);
  const canvas = createCanvas(WIDTH, height);
  const ctx = canvas.getContext('2d');

  paintBackground(ctx, height);
  paintCover(ctx, cover, queue?.paused);
  paintMeta(ctx, meta, queue, song);

  return canvas.toBuffer('image/png');
}

function buildLayout(ctx, queue, song) {
  const columnX = PAD + ART_SIZE + GAP;
  const columnWidth = WIDTH - columnX - PAD;

  ctx.font = TITLE_FONT;
  const titleLines = wrapText(ctx, songTitle(song), columnWidth, 2);
  ctx.font = ARTIST_FONT;
  const artist = ellipsize(ctx, artistName(song), columnWidth);

  const chips = buildChips(ctx, queue, song);
  const chipRows = packChips(ctx, chips, columnWidth);

  const columnHeight = 18 + titleLines.length * 42 + 30 + 26 + 22 + chipRows.length * 36;
  const contentHeight = Math.max(ART_SIZE, columnHeight);
  const height = PAD * 2 + contentHeight + 8;

  return {
    columnX,
    columnWidth,
    titleLines,
    artist,
    chipRows,
    height,
    artTop: PAD,
    metaTop: PAD + (contentHeight - columnHeight) / 2,
  };
}

function buildChips(ctx, queue, song) {
  const paused = Boolean(queue?.paused);
  const repeat = queue?.repeatMode === 2 ? 'LOOP QUEUE' : queue?.repeatMode === 1 ? 'LOOP LAGU' : 'LOOP OFF';
  const queueLength = Math.max((queue?.songs?.length ?? 1) - 1, 0);
  const requester = song?.user?.globalName || song?.user?.username;

  return [
    paused ? 'PAUSED' : 'PLAYING',
    `VOL ${Math.round(queue?.volume ?? 50)}%`,
    repeat,
    queueLength > 0 ? `${queueLength} DI ANTREAN` : 'ANTREAN KOSONG',
    requester ? `OLEH ${requester}` : null,
  ].filter(Boolean);
}

function packChips(ctx, chips, maxWidth) {
  ctx.font = CHIP_FONT;
  const rows = [];
  let row = [];
  let width = 0;

  for (const chip of chips) {
    const chipWidth = ctx.measureText(chip).width + 28;
    if (row.length > 0 && width + 8 + chipWidth > maxWidth) {
      rows.push(row);
      row = [];
      width = 0;
    }
    width += (row.length > 0 ? 8 : 0) + chipWidth;
    row.push({ label: chip, width: chipWidth });
  }
  if (row.length > 0) rows.push(row);
  return rows;
}

function paintBackground(ctx, height) {
  const gradient = ctx.createLinearGradient(0, 0, WIDTH, height);
  gradient.addColorStop(0, '#0d1220');
  gradient.addColorStop(1, '#151b2f');

  roundedRect(ctx, 0.5, 0.5, WIDTH - 1, height - 1, RADIUS);
  ctx.fillStyle = gradient;
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.stroke();

  const glow = ctx.createRadialGradient(PAD + ART_SIZE / 2, PAD + ART_SIZE / 2, 10, PAD + ART_SIZE / 2, PAD + ART_SIZE / 2, 320);
  glow.addColorStop(0, 'rgba(88, 101, 242, 0.22)');
  glow.addColorStop(1, 'rgba(88, 101, 242, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, WIDTH, height);
}

function paintCover(ctx, cover, paused) {
  const y = PAD;

  ctx.save();
  roundedRect(ctx, PAD, y, ART_SIZE, ART_SIZE, 18);
  ctx.clip();

  if (cover) {
    ctx.drawImage(cover, PAD, y, ART_SIZE, ART_SIZE);
  } else {
    const fallback = ctx.createLinearGradient(PAD, y, PAD + ART_SIZE, y + ART_SIZE);
    fallback.addColorStop(0, '#232a45');
    fallback.addColorStop(1, '#161c30');
    ctx.fillStyle = fallback;
    ctx.fillRect(PAD, y, ART_SIZE, ART_SIZE);
  }

  const shade = ctx.createLinearGradient(0, y + ART_SIZE * 0.45, 0, y + ART_SIZE);
  shade.addColorStop(0, 'rgba(8, 11, 20, 0)');
  shade.addColorStop(1, 'rgba(8, 11, 20, 0.78)');
  ctx.fillStyle = shade;
  ctx.fillRect(PAD, y, ART_SIZE, ART_SIZE);
  ctx.restore();

  ctx.save();
  roundedRect(ctx, PAD, y, ART_SIZE, ART_SIZE, 18);
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
  ctx.stroke();
  ctx.restore();

  paintTransportBadge(ctx, PAD + 14, y + ART_SIZE - 50, paused);
}

function paintTransportBadge(ctx, x, y, paused) {
  ctx.save();
  roundedRect(ctx, x, y, 36, 36, 12);
  ctx.fillStyle = 'rgba(10, 14, 26, 0.72)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  if (paused) {
    ctx.fillRect(x + 13, y + 11, 4, 14);
    ctx.fillRect(x + 20, y + 11, 4, 14);
  } else {
    ctx.beginPath();
    ctx.moveTo(x + 14, y + 11);
    ctx.lineTo(x + 26, y + 18);
    ctx.lineTo(x + 14, y + 25);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function paintMeta(ctx, meta, queue, song) {
  const { columnX, columnWidth, titleLines, artist, chipRows } = meta;
  let y = meta.metaTop;

  ctx.font = LABEL_FONT;
  ctx.fillStyle = '#8b93b8';
  ctx.fillText('SEDANG DIPUTAR', columnX, y + 12);
  y += 34;

  ctx.font = TITLE_FONT;
  ctx.fillStyle = '#f4f6ff';
  for (const line of titleLines) {
    ctx.fillText(line, columnX, y + 30);
    y += 42;
  }

  ctx.font = ARTIST_FONT;
  ctx.fillStyle = '#9aa3c7';
  ctx.fillText(artist, columnX, y + 12);
  y += 34;

  paintProgress(ctx, columnX, y, columnWidth, queue, song);
  y += 44;

  ctx.font = CHIP_FONT;
  for (const row of chipRows) {
    let x = columnX;
    for (const chip of row) {
      paintChip(ctx, x, y, chip);
      x += chip.width + 8;
    }
    y += 36;
  }
}

function paintProgress(ctx, x, y, width, queue, song) {
  const duration = Number(song?.duration) || 0;
  const elapsed = Math.min(Math.max(Number(queue?.currentTime) || 0, 0), duration || Infinity);
  const ratio = duration > 0 ? Math.min(elapsed / duration, 1) : 0;

  roundedRect(ctx, x, y, width, 6, 3);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
  ctx.fill();

  if (ratio > 0) {
    const fill = ctx.createLinearGradient(x, y, x + width, y);
    fill.addColorStop(0, '#5865f2');
    fill.addColorStop(1, '#a78bfa');
    roundedRect(ctx, x, y, Math.max(width * ratio, 6), 6, 3);
    ctx.fillStyle = fill;
    ctx.fill();
  }

  const knobX = x + Math.max(width * ratio, 0) + (ratio > 0 ? 0 : 0);
  if (ratio > 0) {
    ctx.beginPath();
    ctx.arc(Math.min(knobX, x + width), y + 3, 6, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
  }

  ctx.font = TIME_FONT;
  ctx.fillStyle = '#8b93b8';
  ctx.fillText(formatTime(elapsed), x, y + 28);

  const durationLabel = duration > 0 ? formatTime(duration) : 'LIVE';
  ctx.fillText(durationLabel, x + width - ctx.measureText(durationLabel).width, y + 28);
}

function paintChip(ctx, x, y, chip) {
  roundedRect(ctx, x, y, chip.width, 26, 13);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.font = CHIP_FONT;
  ctx.fillStyle = '#c3c9e4';
  ctx.fillText(chip.label, x + 14, y + 18);
}

function roundRectPath(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function roundedRect(ctx, x, y, width, height, radius) {
  roundRectPath(ctx, x, y, width, height, radius);
}

function wrapText(ctx, text, maxWidth, maxLines) {
  const words = String(text).split(/\s+/u).filter(Boolean);
  const lines = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    current = word;
    if (lines.length === maxLines) break;
  }

  if (lines.length < maxLines && current) lines.push(current);
  if (lines.length === 0) return ['Tanpa judul'];

  const lastIndex = lines.length - 1;
  lines[lastIndex] = ellipsize(ctx, lines[lastIndex], maxWidth);
  return lines;
}

function ellipsize(ctx, text, maxWidth) {
  const value = String(text || '');
  if (ctx.measureText(value).width <= maxWidth) return value;

  let trimmed = value;
  while (trimmed.length > 1 && ctx.measureText(`${trimmed}…`).width > maxWidth) {
    trimmed = trimmed.slice(0, -1);
  }
  return `${trimmed}…`;
}

function songTitle(song) {
  return song?.name || song?.title || 'Tanpa judul';
}

function artistName(song) {
  return song?.uploader?.name || song?.uploader || 'YouTube';
}

export function formatTime(seconds) {
  const total = Math.max(Math.floor(Number(seconds) || 0), 0);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const pad = (value) => String(value).padStart(2, '0');

  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(secs)}` : `${minutes}:${pad(secs)}`;
}

async function loadCover(url) {
  if (!url) return null;
  if (COVER_CACHE.has(url)) return COVER_CACHE.get(url);

  try {
    const image = await loadImage(url);
    if (COVER_CACHE.size >= COVER_CACHE_LIMIT) {
      COVER_CACHE.delete(COVER_CACHE.keys().next().value);
    }
    COVER_CACHE.set(url, image);
    return image;
  } catch {
    COVER_CACHE.set(url, null);
    return null;
  }
}
