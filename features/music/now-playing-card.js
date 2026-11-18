import { createCanvas, loadImage } from '@napi-rs/canvas';

/**
 * Now-playing card renderer (vertical layout).
 *
 * A wide strip gets scaled down hard by Discord, so the card uses a narrower,
 * taller canvas: the cover sits on top and the text keeps a readable size.
 * Everything is measured, so a wrapped title or extra chips grow the height
 * instead of clipping.
 */

const WIDTH = 760;
const PAD = 24;
const RADIUS = 22;
const COVER_HEIGHT = 250;
const COVER_RADIUS = 16;
const LABEL_FONT = '700 12px sans-serif';
const TITLE_FONT = '700 33px sans-serif';
const ARTIST_FONT = '500 19px sans-serif';
const TIME_FONT = '600 13px sans-serif';
const CHIP_FONT = '600 13px sans-serif';
const TITLE_LINE_HEIGHT = 43;

const COVER_CACHE = new Map();
const COVER_CACHE_LIMIT = 64;

export const CARD_FILENAME = 'now-playing.png';

export async function renderNowPlayingCard(queue, song) {
  const cover = await loadCover(song?.thumbnail);
  const measure = createCanvas(10, 10).getContext('2d');
  const meta = buildLayout(measure, queue, song);

  const canvas = createCanvas(WIDTH, Math.ceil(meta.height));
  const ctx = canvas.getContext('2d');

  paintBackground(ctx, canvas.height);
  paintHeading(ctx, meta, queue);
  paintCover(ctx, cover, queue?.paused, meta);
  paintMeta(ctx, meta, queue, song);

  return canvas.toBuffer('image/png');
}

function buildLayout(ctx, queue, song) {
  const contentWidth = WIDTH - PAD * 2;

  ctx.font = TITLE_FONT;
  const { lines: titleLines } = wrapText(ctx, songTitle(song), contentWidth, 2);

  ctx.font = ARTIST_FONT;
  const artist = ellipsize(ctx, artistName(song), contentWidth);

  ctx.font = CHIP_FONT;
  const chipRows = packChips(ctx, buildChips(queue, song), contentWidth);

  const headingHeight = 30;
  const titleHeight = titleLines.length * TITLE_LINE_HEIGHT;
  const artistHeight = 30;
  const progressHeight = 42;
  const chipsHeight = chipRows.length * 40;

  const height =
    PAD + headingHeight + COVER_HEIGHT + 22 + titleHeight + artistHeight + progressHeight + chipsHeight + PAD;

  return {
    contentWidth,
    titleLines,
    artist,
    chipRows,
    height,
    coverTop: PAD + headingHeight,
    metaTop: PAD + headingHeight + COVER_HEIGHT + 22,
  };
}

function buildChips(queue, song) {
  const paused = Boolean(queue?.paused);
  const repeat = queue?.repeatMode === 2 ? 'LOOP QUEUE' : queue?.repeatMode === 1 ? 'LOOP LAGU' : 'LOOP OFF';
  const queueLength = Math.max((queue?.songs?.length ?? 1) - 1, 0);
  const requester = song?.user?.globalName || song?.user?.username;

  return [
    `VOL ${Math.round(queue?.volume ?? 50)}%`,
    repeat,
    queueLength > 0 ? `${queueLength} DI ANTREAN` : 'ANTREAN KOSONG',
    requester ? `OLEH ${requester}` : null,
    paused ? 'DIJEDA' : null,
  ].filter(Boolean);
}

function packChips(ctx, chips, maxWidth) {
  ctx.font = CHIP_FONT;
  const rows = [];
  let row = [];
  let width = 0;

  for (const chip of chips) {
    const chipWidth = ctx.measureText(chip).width + 30;
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
  gradient.addColorStop(0, '#0b1020');
  gradient.addColorStop(0.55, '#141a2e');
  gradient.addColorStop(1, '#1a2138');

  roundedRect(ctx, 0.5, 0.5, WIDTH - 1, height - 1, RADIUS);
  ctx.fillStyle = gradient;
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.07)';
  ctx.stroke();

  const glow = ctx.createRadialGradient(WIDTH - 80, 40, 10, WIDTH - 80, 40, 380);
  glow.addColorStop(0, 'rgba(124, 101, 242, 0.26)');
  glow.addColorStop(1, 'rgba(124, 101, 242, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, WIDTH, height);
}

function paintHeading(ctx, meta, queue) {
  ctx.font = LABEL_FONT;
  ctx.fillStyle = '#8b93b8';
  ctx.fillText('SEDANG DIPUTAR', PAD, PAD + 12);

  const paused = Boolean(queue?.paused);
  const label = paused ? 'PAUSED' : 'PLAYING';
  ctx.font = CHIP_FONT;
  const labelWidth = ctx.measureText(label).width + 22;
  const x = WIDTH - PAD - labelWidth;

  roundedRect(ctx, x, PAD - 2, labelWidth, 24, 12);
  ctx.fillStyle = paused ? 'rgba(254, 231, 92, 0.14)' : 'rgba(87, 242, 135, 0.14)';
  ctx.fill();
  ctx.fillStyle = paused ? '#fee75c' : '#57f287';
  ctx.fillText(label, x + 11, PAD + 14);

  void meta;
}

function paintCover(ctx, cover, paused, meta) {
  const x = PAD;
  const y = meta.coverTop;
  const width = meta.contentWidth;

  ctx.save();
  roundedRect(ctx, x, y, width, COVER_HEIGHT, COVER_RADIUS);
  ctx.clip();

  if (cover) {
    drawCoverImage(ctx, cover, x, y, width, COVER_HEIGHT);
  } else {
    const fallback = ctx.createLinearGradient(x, y, x + width, y + COVER_HEIGHT);
    fallback.addColorStop(0, '#222a45');
    fallback.addColorStop(1, '#141a2b');
    ctx.fillStyle = fallback;
    ctx.fillRect(x, y, width, COVER_HEIGHT);
    paintNoteGlyph(ctx, x + width / 2, y + COVER_HEIGHT / 2);
  }

  const shade = ctx.createLinearGradient(0, y + COVER_HEIGHT * 0.35, 0, y + COVER_HEIGHT);
  shade.addColorStop(0, 'rgba(6, 9, 18, 0)');
  shade.addColorStop(1, 'rgba(6, 9, 18, 0.82)');
  ctx.fillStyle = shade;
  ctx.fillRect(x, y, width, COVER_HEIGHT);
  ctx.restore();

  ctx.save();
  roundedRect(ctx, x, y, width, COVER_HEIGHT, COVER_RADIUS);
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
  ctx.stroke();
  ctx.restore();

  paintTransportBadge(ctx, x + 16, y + COVER_HEIGHT - 60, paused);
}

function drawCoverImage(ctx, image, x, y, width, height) {
  const scale = Math.max(width / image.width, height / image.height);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  const offsetX = x + (width - drawWidth) / 2;
  const offsetY = y + (height - drawHeight) / 2;

  ctx.drawImage(image, offsetX, offsetY, drawWidth, drawHeight);
}

function paintNoteGlyph(ctx, cx, cy) {
  ctx.save();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';

  ctx.beginPath();
  ctx.ellipse(cx - 30, cy + 26, 17, 12, -0.32, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx + 26, cy + 15, 17, 12, -0.32, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillRect(cx - 14, cy - 30, 4, 58);
  ctx.fillRect(cx + 42, cy - 41, 4, 58);

  ctx.beginPath();
  ctx.moveTo(cx - 14, cy - 30);
  ctx.lineTo(cx + 46, cy - 41);
  ctx.lineTo(cx + 46, cy - 28);
  ctx.lineTo(cx - 14, cy - 17);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function paintTransportBadge(ctx, x, y, paused) {
  ctx.save();
  roundedRect(ctx, x, y, 44, 44, 14);
  ctx.fillStyle = 'rgba(8, 12, 22, 0.68)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  if (paused) {
    ctx.fillRect(x + 16, y + 13, 5, 18);
    ctx.fillRect(x + 25, y + 13, 5, 18);
  } else {
    ctx.beginPath();
    ctx.moveTo(x + 17, y + 13);
    ctx.lineTo(x + 31, y + 22);
    ctx.lineTo(x + 17, y + 31);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function paintMeta(ctx, meta, queue, song) {
  const { contentWidth } = meta;
  let y = meta.metaTop;

  ctx.font = TITLE_FONT;
  ctx.fillStyle = '#f5f7ff';
  for (const line of meta.titleLines) {
    ctx.fillText(line, PAD, y + 30);
    y += TITLE_LINE_HEIGHT;
  }

  ctx.font = ARTIST_FONT;
  ctx.fillStyle = '#98a1c4';
  ctx.fillText(meta.artist, PAD, y + 18);
  y += 30;

  paintProgress(ctx, y, contentWidth, queue, song);
  y += 42;

  ctx.font = CHIP_FONT;
  for (const row of meta.chipRows) {
    let x = PAD;
    for (const chip of row) {
      paintChip(ctx, x, y, chip);
      x += chip.width + 8;
    }
    y += 40;
  }
}

function paintProgress(ctx, y, width, queue, song) {
  const duration = Number(song?.duration) || 0;
  const elapsed = Math.min(Math.max(Number(queue?.currentTime) || 0, 0), duration || Infinity);
  const ratio = duration > 0 ? Math.min(elapsed / duration, 1) : 0;
  const barY = y + 8;

  roundedRect(ctx, PAD, barY, width, 8, 4);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
  ctx.fill();

  if (ratio > 0) {
    const fill = ctx.createLinearGradient(PAD, barY, PAD + width, barY);
    fill.addColorStop(0, '#5865f2');
    fill.addColorStop(1, '#a78bfa');
    roundedRect(ctx, PAD, barY, Math.max(width * ratio, 8), 8, 4);
    ctx.fillStyle = fill;
    ctx.fill();

    const knobX = PAD + width * ratio;
    ctx.beginPath();
    ctx.arc(knobX, barY + 4, 7, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
  }

  ctx.font = TIME_FONT;
  ctx.fillStyle = '#8b93b8';
  ctx.fillText(formatTime(elapsed), PAD, y + 34);

  const durationLabel = duration > 0 ? formatTime(duration) : 'LIVE';
  ctx.fillText(durationLabel, PAD + width - ctx.measureText(durationLabel).width, y + 34);
}

function paintChip(ctx, x, y, chip) {
  roundedRect(ctx, x, y, chip.width, 30, 15);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.055)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.09)';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.font = CHIP_FONT;
  ctx.fillStyle = '#c3c9e4';
  ctx.fillText(chip.label, x + 15, y + 20);
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
  if (words.length === 0) return { lines: ['Tanpa judul'], truncated: false };

  const lines = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (!current || ctx.measureText(candidate).width <= maxWidth) {
      current = candidate;
      continue;
    }
    lines.push(current);
    current = word;
  }
  if (current) lines.push(current);

  const truncated = lines.length > maxLines;
  const visible = lines.slice(0, maxLines).map((line) => ellipsize(ctx, line, maxWidth));
  if (truncated && visible.length > 0) {
    visible[visible.length - 1] = withEllipsis(ctx, visible[visible.length - 1], maxWidth);
  }

  return { lines: visible, truncated };
}

function withEllipsis(ctx, text, maxWidth) {
  if (text.endsWith('…') && ctx.measureText(text).width <= maxWidth) return text;

  const base = text.replace(/…$/u, '');
  let trimmed = base;
  while (trimmed.length > 1 && ctx.measureText(`${trimmed}…`).width > maxWidth) {
    trimmed = trimmed.slice(0, -1);
  }
  return `${trimmed}…`;
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
