import { createCanvas, loadImage } from '@napi-rs/canvas';

/**
 * Profile card renderer.
 *
 * Shares the visual language of the now-playing card: dark gradient, rounded
 * panels, one accent gradient and no decorative noise. Height is measured from
 * the actual rows so empty lists do not leave holes in the layout.
 */

const WIDTH = 900;
const PAD = 28;
const GAP = 16;
const RADIUS = 24;
const PANEL_RADIUS = 16;
const AVATAR_SIZE = 96;
const HEADER_HEIGHT = 192;
const ROW_HEIGHT = 54;
const CHIP_HEIGHT = 30;

const EYEBROW_FONT = '700 12px sans-serif';
const NAME_FONT = '700 34px sans-serif';
const SUBTITLE_FONT = '500 15px sans-serif';
const PANEL_TITLE_FONT = '700 12px sans-serif';
const ROW_TITLE_FONT = '600 16px sans-serif';
const ROW_META_FONT = '500 13px sans-serif';
const CHIP_LABEL_FONT = '700 10px sans-serif';
const CHIP_VALUE_FONT = '700 15px sans-serif';

const ACCENT_START = '#5865f2';
const ACCENT_END = '#a78bfa';

const AVATAR_CACHE = new Map();
const AVATAR_CACHE_LIMIT = 32;
const AVATAR_TIMEOUT_MS = 6_000;

export async function renderProfileCard({ displayName, avatarUrl, profile }) {
  const safeProfile = profile ?? emptyProfile();
  const measure = createCanvas(10, 10).getContext('2d');

  const avatar = await loadAvatar(avatarUrl);
  const layout = buildLayout(measure, safeProfile);

  const canvas = createCanvas(WIDTH, Math.ceil(layout.height));
  const ctx = canvas.getContext('2d');

  paintBackground(ctx, canvas.height);
  paintHeader(ctx, displayName, safeProfile.summary, avatar);
  paintPanel(ctx, layout.servers);
  paintPanel(ctx, layout.friends);
  paintPanel(ctx, layout.tracks);

  return canvas.encode('png');
}

function buildLayout(ctx, profile) {
  const columnWidth = Math.floor((WIDTH - PAD * 2 - GAP) / 2);
  const servers = buildPanel('TOP SERVERS', profile.topServers, 'Belum ada aktivitas server', formatServerRow);
  const friends = buildPanel('TOP FRIENDS', profile.topFriends, 'Belum ada listener bersama', formatFriendRow);

  const sideHeight = Math.max(panelHeight(servers), panelHeight(friends));
  const panelsTop = HEADER_HEIGHT;

  const tracks = buildTrackPanel(profile.topTracks);
  const tracksTop = panelsTop + sideHeight + GAP;
  const height = tracksTop + panelHeight(tracks) + PAD;

  return {
    columnWidth,
    height,
    servers: { ...servers, x: PAD, y: panelsTop, width: columnWidth },
    friends: { ...friends, x: PAD + columnWidth + GAP, y: panelsTop, width: columnWidth },
    tracks: { ...tracks, x: PAD, y: tracksTop, width: WIDTH - PAD * 2 },
  };
}

function buildPanel(title, rows, emptyText, formatter) {
  const visible = Array.isArray(rows) ? rows.slice(0, 3) : [];
  const items = visible.length > 0 ? visible.map((row) => ({ row, formatter })) : [{ empty: emptyText }];
  return { title, items };
}

function buildTrackPanel(rows) {
  const visible = Array.isArray(rows) ? rows.slice(0, 3) : [];
  const maxPlays = Math.max(1, ...visible.map((row) => Number(row.plays) || 0));
  const items = visible.length > 0
    ? visible.map((row) => ({ row, formatter: formatTrackRow, ratio: (Number(row.plays) || 0) / maxPlays }))
    : [{ empty: 'Putar musik untuk mengisi daftar track' }];
  return { title: 'TOP TRACKS', items };
}

function panelHeight(panel) {
  return 44 + panel.items.length * ROW_HEIGHT + 8;
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

  const glow = ctx.createRadialGradient(WIDTH - 90, 30, 10, WIDTH - 90, 30, 420);
  glow.addColorStop(0, 'rgba(124, 101, 242, 0.22)');
  glow.addColorStop(1, 'rgba(124, 101, 242, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, WIDTH, height);
}

function paintHeader(ctx, displayName, summary, avatar) {
  const centerX = PAD + AVATAR_SIZE / 2;
  const centerY = PAD + AVATAR_SIZE / 2;

  ctx.save();
  ctx.beginPath();
  ctx.arc(centerX, centerY, AVATAR_SIZE / 2, 0, Math.PI * 2);
  ctx.clip();
  if (avatar) {
    ctx.drawImage(avatar, PAD, PAD, AVATAR_SIZE, AVATAR_SIZE);
  } else {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.07)';
    ctx.fillRect(PAD, PAD, AVATAR_SIZE, AVATAR_SIZE);
    ctx.fillStyle = '#c3c9e4';
    ctx.font = '700 32px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(initials(displayName), centerX, centerY + 1);
    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';
  }
  ctx.restore();

  ctx.beginPath();
  ctx.arc(centerX, centerY, AVATAR_SIZE / 2 - 0.5, 0, Math.PI * 2);
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(167, 139, 250, 0.65)';
  ctx.stroke();

  const textX = PAD + AVATAR_SIZE + 22;

  ctx.font = EYEBROW_FONT;
  ctx.fillStyle = '#8b93b8';
  ctx.fillText('VIBES PROFILE', textX, PAD + 16);

  ctx.font = NAME_FONT;
  ctx.fillStyle = '#f5f7ff';
  ctx.fillText(ellipsize(ctx, displayName || 'Listener', WIDTH - PAD - textX), textX, PAD + 56);

  ctx.font = SUBTITLE_FONT;
  ctx.fillStyle = '#98a1c4';
  ctx.fillText('Ringkasan aktivitas musik kamu di Vibes', textX, PAD + 84);

  const chips = [
    ['PLAYS', summary?.plays],
    ['COMMANDS', summary?.commands],
    ['SERVERS', summary?.servers],
  ];
  let chipX = textX;
  for (const [label, value] of chips) {
    chipX += paintStatChip(ctx, chipX, PAD + 100, label, value) + 8;
  }
}

function paintStatChip(ctx, x, y, label, value) {
  ctx.font = CHIP_VALUE_FONT;
  const valueWidth = ctx.measureText(formatNumber(value)).width;
  ctx.font = CHIP_LABEL_FONT;
  const labelWidth = ctx.measureText(label).width;
  const width = Math.max(valueWidth, labelWidth) + 28;

  roundedRect(ctx, x, y, width, CHIP_HEIGHT + 12, 12);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.055)';
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.09)';
  ctx.stroke();

  ctx.font = CHIP_LABEL_FONT;
  ctx.fillStyle = '#8b93b8';
  ctx.fillText(label, x + 14, y + 17);

  ctx.font = CHIP_VALUE_FONT;
  ctx.fillStyle = '#f5f7ff';
  ctx.fillText(formatNumber(value), x + 14, y + 35);

  return width;
}

function paintPanel(ctx, panel) {
  roundedRect(ctx, panel.x, panel.y, panel.width, panelHeight(panel), PANEL_RADIUS);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.stroke();

  ctx.font = PANEL_TITLE_FONT;
  ctx.fillStyle = '#8b93b8';
  ctx.fillText(panel.title, panel.x + 18, panel.y + 28);

  panel.items.forEach((item, index) => {
    const rowY = panel.y + 44 + index * ROW_HEIGHT;

    if (item.empty) {
      ctx.font = ROW_META_FONT;
      ctx.fillStyle = '#7c85a8';
      ctx.fillText(item.empty, panel.x + 18, rowY + 24);
      return;
    }

    paintRank(ctx, panel.x + 18, rowY + 8, index + 1);
    item.formatter(ctx, item.row, panel.x + 50, rowY, panel.width - 68, item);
  });
}

function paintRank(ctx, x, y, rank) {
  roundedRect(ctx, x, y, 24, 24, 7);
  ctx.fillStyle = rank === 1 ? 'rgba(124, 101, 242, 0.35)' : 'rgba(255, 255, 255, 0.06)';
  ctx.fill();

  ctx.font = '700 12px sans-serif';
  ctx.fillStyle = rank === 1 ? '#d8ccff' : '#9aa3c7';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(rank), x + 12, y + 13);
  ctx.textAlign = 'start';
  ctx.textBaseline = 'alphabetic';
}

function formatServerRow(ctx, row, x, y, maxWidth) {
  ctx.font = ROW_TITLE_FONT;
  ctx.fillStyle = '#f5f7ff';
  ctx.fillText(ellipsize(ctx, row.name, maxWidth), x, y + 16);

  ctx.font = ROW_META_FONT;
  ctx.fillStyle = '#8b93b8';
  ctx.fillText(`${formatNumber(row.plays)} plays · ${formatNumber(row.commands)} commands`, x, y + 36);
}

function formatFriendRow(ctx, row, x, y, maxWidth) {
  ctx.font = ROW_TITLE_FONT;
  ctx.fillStyle = '#f5f7ff';
  ctx.fillText(ellipsize(ctx, row.name, maxWidth), x, y + 16);

  ctx.font = ROW_META_FONT;
  ctx.fillStyle = '#8b93b8';
  ctx.fillText(`${formatNumber(row.plays)} plays bersama`, x, y + 36);
}

function formatTrackRow(ctx, row, x, y, maxWidth, item) {
  const barWidth = Math.max(maxWidth - 12, 120);
  const nameWidth = barWidth;

  ctx.font = ROW_TITLE_FONT;
  ctx.fillStyle = '#f5f7ff';
  ctx.fillText(ellipsize(ctx, row.title, nameWidth), x, y + 16);

  ctx.font = ROW_META_FONT;
  ctx.fillStyle = '#8b93b8';
  ctx.fillText(`${formatDuration(row.durationSeconds)} · ${formatNumber(row.plays)} plays`, x, y + 34);

  const barY = y + 40;
  roundedRect(ctx, x, barY, barWidth, 4, 2);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.fill();

  const ratio = Math.min(Math.max(item?.ratio ?? 0, 0.02), 1);
  const fill = ctx.createLinearGradient(x, barY, x + barWidth, barY);
  fill.addColorStop(0, ACCENT_START);
  fill.addColorStop(1, ACCENT_END);
  roundedRect(ctx, x, barY, barWidth * ratio, 4, 2);
  ctx.fillStyle = fill;
  ctx.fill();
}

function roundedRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function ellipsize(ctx, value, maxWidth) {
  const text = String(value || 'Unknown').replace(/\s+/gu, ' ');
  if (ctx.measureText(text).width <= maxWidth) return text;

  let trimmed = text;
  while (trimmed.length > 1 && ctx.measureText(`${trimmed}…`).width > maxWidth) {
    trimmed = trimmed.slice(0, -1);
  }
  return `${trimmed}…`;
}

function initials(value) {
  const letters = String(value || 'L')
    .trim()
    .split(/\s+/u)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();

  return letters || 'L';
}

function formatNumber(value) {
  return new Intl.NumberFormat('id-ID').format(Number(value) || 0);
}

function formatDuration(seconds) {
  const totalMinutes = Math.max(0, Math.floor((Number(seconds) || 0) / 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}j ${minutes}m` : `${minutes}m`;
}

function emptyProfile() {
  return {
    summary: { plays: 0, commands: 0, servers: 0 },
    topServers: [],
    topFriends: [],
    topTracks: [],
  };
}

async function loadAvatar(url) {
  if (!url) return null;
  if (AVATAR_CACHE.has(url)) return AVATAR_CACHE.get(url);

  const image = (await fetchAvatar(url)) ?? (await decodeAvatar(url));
  rememberAvatar(url, image);
  return image;
}

async function fetchAvatar(url) {
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; vibes-discord/1.0)' },
      signal: AbortSignal.timeout(AVATAR_TIMEOUT_MS),
    });
    if (!response.ok) return null;

    const image = await loadImage(Buffer.from(await response.arrayBuffer()));
    return image.width >= 32 ? image : null;
  } catch {
    return null;
  }
}

async function decodeAvatar(url) {
  try {
    return await loadImage(url);
  } catch {
    return null;
  }
}

function rememberAvatar(url, image) {
  if (AVATAR_CACHE.size >= AVATAR_CACHE_LIMIT) {
    AVATAR_CACHE.delete(AVATAR_CACHE.keys().next().value);
  }
  AVATAR_CACHE.set(url, image);
}
