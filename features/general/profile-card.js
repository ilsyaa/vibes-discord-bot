import { createCanvas, loadImage } from '@napi-rs/canvas';

const WIDTH = 1200;
const HEIGHT = 700;
const avatarCache = new Map();

export async function renderProfileCard({ displayName, avatarUrl, profile }) {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const context = canvas.getContext('2d');
  const safeProfile = profile || emptyProfile();

  drawBackground(context);
  drawHeader(context, displayName, safeProfile.summary);
  await drawAvatar(context, avatarUrl, displayName);
  drawPanel(context, 64, 230, 520, 210, 'TOP SERVERS', safeProfile.topServers, formatServerRow);
  drawPanel(context, 616, 230, 520, 210, 'TOP FRIENDS', safeProfile.topFriends, formatFriendRow);
  drawPanel(context, 64, 470, 1072, 170, 'TOP TRACKS', safeProfile.topTracks, formatTrackRow);

  return canvas.encode('png');
}

function drawBackground(context) {
  const gradient = context.createLinearGradient(0, 0, WIDTH, HEIGHT);
  gradient.addColorStop(0, '#17131a');
  gradient.addColorStop(0.52, '#5b202d');
  gradient.addColorStop(1, '#1b1118');
  context.fillStyle = gradient;
  context.fillRect(0, 0, WIDTH, HEIGHT);

  context.save();
  context.globalAlpha = 0.12;
  context.strokeStyle = '#f7cad7';
  context.lineWidth = 5;
  for (let x = -160; x < WIDTH + 240; x += 190) {
    context.beginPath();
    context.arc(x, 330, 90, Math.PI * 0.1, Math.PI * 1.7);
    context.stroke();
    context.beginPath();
    context.moveTo(x + 80, 90);
    context.lineTo(x + 160, 270);
    context.stroke();
  }
  context.restore();
}

function drawHeader(context, displayName, summary) {
  context.fillStyle = '#f4d9df';
  context.font = '700 22px sans-serif';
  context.fillText('VIBES PROFILE', 64, 56);

  context.fillStyle = '#fff7f9';
  context.font = '700 42px sans-serif';
  context.fillText(truncate(context, displayName || 'Listener', 390), 200, 116);

  context.fillStyle = '#f6b1c2';
  context.font = '500 20px sans-serif';
  context.fillText('Your music activity at a glance', 200, 151);

  const stats = [
    ['PLAYS', summary.plays],
    ['COMMANDS', summary.commands],
    ['SERVERS', summary.servers],
  ];
  let x = 200;
  for (const [label, value] of stats) {
    drawStatChip(context, x, 176, label, value);
    x += 156;
  }
}

function drawStatChip(context, x, y, label, value) {
  roundRect(context, x, y, 136, 40, 12, '#3f1f2b');
  context.fillStyle = '#f5bdca';
  context.font = '700 11px sans-serif';
  context.fillText(label, x + 12, y + 14);
  context.fillStyle = '#fff7f9';
  context.font = '700 16px sans-serif';
  context.fillText(formatNumber(value), x + 12, y + 31);
}

async function drawAvatar(context, avatarUrl, displayName) {
  const centerX = 110;
  const centerY = 128;
  const radius = 72;
  const image = await getAvatar(avatarUrl);

  context.save();
  context.beginPath();
  context.arc(centerX, centerY, radius, 0, Math.PI * 2);
  context.clip();
  if (image) {
    context.drawImage(image, centerX - radius, centerY - radius, radius * 2, radius * 2);
  } else {
    context.fillStyle = '#382631';
    context.fillRect(centerX - radius, centerY - radius, radius * 2, radius * 2);
    context.fillStyle = '#f5bdca';
    context.font = '700 52px sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(initials(displayName), centerX, centerY + 2);
    context.textAlign = 'start';
    context.textBaseline = 'alphabetic';
  }
  context.restore();

  context.strokeStyle = '#f3a8bb';
  context.lineWidth = 5;
  context.beginPath();
  context.arc(centerX, centerY, radius + 2, 0, Math.PI * 2);
  context.stroke();
}

function drawPanel(context, x, y, width, height, title, rows, formatter) {
  roundRect(context, x, y, width, height, 16, 'rgba(26, 16, 23, 0.72)');
  context.fillStyle = '#f4b4c3';
  context.font = '700 16px sans-serif';
  context.fillText(title, x + 24, y + 32);

  const safeRows = rows?.length ? rows.slice(0, 3) : [{ empty: true }];
  safeRows.forEach((row, index) => {
    const rowY = y + 62 + index * 44;
    drawRank(context, x + 22, rowY - 13, index + 1);
    formatter(context, row, x + 62, rowY);
  });
}

function drawRank(context, x, y, rank) {
  roundRect(context, x, y, 28, 28, 7, rank === 1 ? '#d85a70' : '#8c3c4d');
  context.fillStyle = '#fff7f9';
  context.font = '700 14px sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(`${rank}`, x + 14, y + 15);
  context.textAlign = 'start';
  context.textBaseline = 'alphabetic';
}

function formatServerRow(context, row, x, y) {
  if (row.empty) return drawEmptyRow(context, x, y, 'Belum ada aktivitas server');
  context.fillStyle = '#fff7f9';
  context.font = '600 18px sans-serif';
  context.fillText(truncate(context, row.name, 300), x, y);
  context.fillStyle = '#dca5b3';
  context.font = '500 14px sans-serif';
  context.fillText(`${formatNumber(row.plays)} plays • ${formatNumber(row.commands)} commands`, x, y + 20);
}

function formatFriendRow(context, row, x, y) {
  if (row.empty) return drawEmptyRow(context, x, y, 'Belum ada listener bersama');
  context.fillStyle = '#fff7f9';
  context.font = '600 18px sans-serif';
  context.fillText(truncate(context, row.name, 300), x, y);
  context.fillStyle = '#dca5b3';
  context.font = '500 14px sans-serif';
  context.fillText(`${formatNumber(row.plays)} plays bersama`, x, y + 20);
}

function formatTrackRow(context, row, x, y) {
  if (row.empty) return drawEmptyRow(context, x, y, 'Putar musik untuk mengisi daftar track');
  context.fillStyle = '#fff7f9';
  context.font = '600 18px sans-serif';
  context.fillText(truncate(context, row.title, 700), x, y);
  context.fillStyle = '#dca5b3';
  context.font = '500 14px sans-serif';
  context.fillText(`${formatDuration(row.durationSeconds)} • ${formatNumber(row.plays)} plays`, x, y + 20);
}

function drawEmptyRow(context, x, y, text) {
  context.fillStyle = '#c7909e';
  context.font = '500 16px sans-serif';
  context.fillText(text, x, y);
}

async function getAvatar(avatarUrl) {
  if (!avatarUrl) return null;
  if (avatarCache.has(avatarUrl)) return avatarCache.get(avatarUrl);

  try {
    const image = await loadImage(avatarUrl);
    if (avatarCache.size >= 64) avatarCache.delete(avatarCache.keys().next().value);
    avatarCache.set(avatarUrl, image);
    return image;
  } catch {
    return null;
  }
}

function roundRect(context, x, y, width, height, radius, fillStyle) {
  context.fillStyle = fillStyle;
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + width, y, x + width, y + height, radius);
  context.arcTo(x + width, y + height, x, y + height, radius);
  context.arcTo(x, y + height, x, y, radius);
  context.arcTo(x, y, x + width, y, radius);
  context.closePath();
  context.fill();
}

function truncate(context, value, maxWidth) {
  const text = String(value || 'Unknown');
  if (context.measureText(text).width <= maxWidth) return text;
  let result = text;
  while (result.length > 1 && context.measureText(`${result}…`).width > maxWidth) {
    result = result.slice(0, -1);
  }
  return `${result}…`;
}

function initials(value) {
  return String(value || 'L')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase() || 'L';
}

function formatNumber(value) {
  return new Intl.NumberFormat('id-ID').format(Number(value) || 0);
}

function formatDuration(seconds) {
  const totalMinutes = Math.max(0, Math.floor((Number(seconds) || 0) / 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function emptyProfile() {
  return {
    summary: { plays: 0, commands: 0, servers: 0 },
    topServers: [],
    topFriends: [],
    topTracks: [],
  };
}
