import http from 'node:http';
import crypto from 'node:crypto';

const DISCORD_API = 'https://discord.com/api/v10';
const SESSION_COOKIE = 'vibes_session';
const OAUTH_COOKIE = 'vibes_oauth_state';
const MANAGE_GUILD = 1n << 5n;
const ADMINISTRATOR = 1n << 3n;
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const MAX_OAUTH_STATES = 1000;
const OAUTH_ATTEMPT_WINDOW_MS = 10 * 60 * 1000;
const OAUTH_ATTEMPT_LIMIT = 10;
const oauthAttempts = new Map();

export function createDashboardServer({ client, store, config }) {
  return http.createServer(async (request, response) => {
    try {
      await routeRequest(request, response, { client, store, config });
    } catch (error) {
      console.error('Dashboard request failed:', error);
      sendJson(response, 500, { error: 'internal_error', message: 'Dashboard request failed.' });
    }
  });
}

export async function startDashboard({ client, store, config }) {
  const server = createDashboardServer({ client, store, config });
  server.requestTimeout = 30_000;
  server.headersTimeout = 10_000;
  store.cleanupExpired();
  const cleanup = setInterval(() => store.cleanupExpired(), 60 * 60 * 1000);
  cleanup.unref();
  server.once('close', () => clearInterval(cleanup));
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(config.dashboardPort, config.dashboardHost, resolve);
  });
  console.log(`🌐 Dashboard listening on ${config.dashboardHost}:${config.dashboardPort}`);
  return server;
}

async function routeRequest(request, response, context) {
  const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);

  if (url.pathname === '/health' && request.method === 'GET') {
    return sendJson(response, 200, { ok: true });
  }

  if (url.pathname === '/' && request.method === 'GET') {
    return sendHtml(response, 200, renderDashboardHtml());
  }

  if (url.pathname === '/auth/login' && request.method === 'GET') {
    return startOAuth(request, response, context);
  }

  if (url.pathname === '/auth/callback' && request.method === 'GET') {
    return finishOAuth(url, request, response, context);
  }

  if (url.pathname === '/auth/logout' && request.method === 'POST') {
    const session = requireSession(request, response, context.store, context.config);
    if (!session) return;
    if (!sameOrigin(request, context.config) || request.headers['x-csrf-token'] !== session.csrfToken) {
      return sendJson(response, 403, { error: 'csrf_failed', message: 'CSRF validation failed.' });
    }
    context.store.deleteSession(session.sessionHash);
    response.writeHead(204, { 'Set-Cookie': clearSessionCookie(context.config) });
    return response.end();
  }

  if (url.pathname === '/auth/logout' && request.method === 'GET') {
    return sendJson(response, 405, { error: 'method_not_allowed', message: 'Use POST to sign out.' });
  }

  if (url.pathname === '/api/me' && request.method === 'GET') {
    const session = requireSession(request, response, context.store, context.config);
    if (!session) return;
    return sendJson(response, 200, {
      user: session.user,
      guilds: session.guilds,
      csrfToken: session.csrfToken,
    });
  }

  const settingsMatch = url.pathname.match(/^\/api\/guilds\/([0-9]+)\/settings$/u);
  if (settingsMatch && (request.method === 'GET' || request.method === 'PATCH')) {
    return handleGuildSettings(request, response, settingsMatch[1], context);
  }

  const metricsMatch = url.pathname.match(/^\/api\/guilds\/([0-9]+)\/metrics$/u);
  if (metricsMatch && request.method === 'GET') {
    return handleGuildRead(request, response, metricsMatch[1], context, () => context.store.getMetrics(metricsMatch[1]));
  }

  const auditMatch = url.pathname.match(/^\/api\/guilds\/([0-9]+)\/audit$/u);
  if (auditMatch && request.method === 'GET') {
    return handleGuildRead(request, response, auditMatch[1], context, () => context.store.listAudit(auditMatch[1]));
  }

  sendJson(response, 404, { error: 'not_found', message: 'Route not found.' });
}

function startOAuth(request, response, { config, store }) {
  if (!isConfigured(config)) {
    return sendJson(response, 503, {
      error: 'dashboard_not_configured',
      message: 'Set DASHBOARD_PUBLIC_URL, DASHBOARD_CLIENT_ID, DASHBOARD_CLIENT_SECRET, and DASHBOARD_SESSION_SECRET.',
    });
  }
  if (!allowOAuthAttempt(request)) {
    return sendJson(response, 429, { error: 'rate_limited', message: 'Too many login attempts. Try again later.' });
  }
  store.cleanupExpired();
  if (store.countActiveOAuthStates() >= MAX_OAUTH_STATES) {
    return sendJson(response, 503, { error: 'oauth_capacity_reached', message: 'Login is temporarily busy. Try again later.' });
  }

  const state = randomToken(32);
  const verifier = randomToken(48);
  const stateHash = hashToken(state, config.dashboardSessionSecret);
  const expiresAt = new Date(Date.now() + OAUTH_STATE_TTL_MS).toISOString();
  store.createOAuthState(stateHash, verifier, expiresAt);

  const authorizeUrl = new URL('https://discord.com/oauth2/authorize');
  authorizeUrl.searchParams.set('response_type', 'code');
  authorizeUrl.searchParams.set('client_id', config.dashboardClientId);
  authorizeUrl.searchParams.set('scope', 'identify guilds');
  authorizeUrl.searchParams.set('state', state);
  authorizeUrl.searchParams.set('redirect_uri', `${config.dashboardPublicUrl}/auth/callback`);
  authorizeUrl.searchParams.set('code_challenge_method', 'S256');
  authorizeUrl.searchParams.set('code_challenge', pkceChallenge(verifier));
  authorizeUrl.searchParams.set('prompt', 'consent');

  response.writeHead(302, {
    Location: authorizeUrl.toString(),
    'Set-Cookie': oauthStateCookie(stateHash, config),
  });
  return response.end();
}

async function finishOAuth(url, request, response, { client, store, config }) {
  if (!isConfigured(config)) return sendJson(response, 503, { error: 'dashboard_not_configured' });
  if (url.searchParams.get('iss') && url.searchParams.get('iss') !== 'https://discord.com') {
    return sendJson(response, 400, { error: 'invalid_issuer', message: 'OAuth issuer was not Discord.' });
  }

  const state = url.searchParams.get('state');
  const code = url.searchParams.get('code');
  if (!state || !code) return sendJson(response, 400, { error: 'oauth_callback_invalid' });
  const cookies = parseCookies(request.headers.cookie || '');
  if (cookies[OAUTH_COOKIE] !== hashToken(state, config.dashboardSessionSecret)) {
    return sendJson(response, 400, { error: 'oauth_state_browser_mismatch' });
  }

  const oauthState = store.consumeOAuthState(hashToken(state, config.dashboardSessionSecret));
  if (!oauthState) return sendJson(response, 400, { error: 'oauth_state_invalid_or_expired' });

  const token = await exchangeCode(code, oauthState.codeVerifier, config);
  const [user, guilds] = await Promise.all([
    discordGet('/users/@me', token.access_token),
    discordGet('/users/@me/guilds', token.access_token),
  ]);

  const manageableGuilds = guilds
    .filter((guild) => hasManagePermission(guild.permissions))
    .filter((guild) => client.guilds.cache.has(guild.id))
    .map((guild) => ({
      id: guild.id,
      name: guild.name,
      icon: guild.icon,
      permissions: guild.permissions,
    }));

  const sessionToken = randomToken(48);
  const csrfToken = randomToken(32);
  store.createSession({
    sessionHash: hashToken(sessionToken, config.dashboardSessionSecret),
    userId: user.id,
    user,
    guilds: manageableGuilds,
    csrfToken,
    accessTokenEncrypted: encryptSecret(token.access_token, config.dashboardSessionSecret),
    expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
  });

  response.writeHead(302, {
    Location: '/',
    'Set-Cookie': [sessionCookie(sessionToken, config), clearOAuthStateCookie(config)],
  });
  return response.end();
}

async function exchangeCode(code, codeVerifier, config) {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: `${config.dashboardPublicUrl}/auth/callback`,
    code_verifier: codeVerifier,
  });
  const authorization = Buffer
    .from(`${config.dashboardClientId}:${config.dashboardClientSecret}`)
    .toString('base64');
  const response = await fetch(`${DISCORD_API.replace('/api/v10', '')}/api/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${authorization}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Discord OAuth token exchange failed with ${response.status}`);
  return response.json();
}

async function discordGet(pathname, accessToken) {
  const response = await fetch(`${DISCORD_API}${pathname}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Discord OAuth API request failed with ${response.status}`);
  return response.json();
}

async function handleGuildSettings(request, response, guildId, context) {
  const authorization = await authorizeGuild(request, response, guildId, context);
  if (!authorization) return;

  if (request.method === 'GET') {
    return sendJson(response, 200, context.store.ensureGuildSettings(guildId));
  }

  if (!sameOrigin(request, context.config) || request.headers['x-csrf-token'] !== authorization.session.csrfToken) {
    return sendJson(response, 403, { error: 'csrf_failed', message: 'CSRF validation failed.' });
  }

  let body;
  try {
    body = await readJsonBody(request);
  } catch (error) {
    return sendJson(response, 400, { error: 'invalid_body', message: error.message });
  }

  let patch;
  try {
    patch = normalizeSettingsPatch(body);
  } catch (error) {
    return sendJson(response, 400, { error: 'invalid_settings', message: error.message });
  }
  const settings = context.store.updateGuildSettings(guildId, patch, authorization.session.userId);
  return sendJson(response, 200, settings);
}

async function handleGuildRead(request, response, guildId, context, read) {
  if (!(await authorizeGuild(request, response, guildId, context))) return;
  return sendJson(response, 200, read());
}

async function authorizeGuild(request, response, guildId, { client, store, config }) {
  const session = requireSession(request, response, store, config);
  if (!session) return null;
  if (!session.accessTokenEncrypted) {
    sendJson(response, 401, { error: 'reauth_required', message: 'Sign in again to refresh Discord permissions.' });
    return null;
  }

  let guilds;
  try {
    guilds = await discordGet('/users/@me/guilds', decryptSecret(session.accessTokenEncrypted, config.dashboardSessionSecret));
  } catch {
    sendJson(response, 401, { error: 'reauth_required', message: 'Discord authorization expired. Sign in again.' });
    return null;
  }

  const guild = guilds.find((entry) => entry.id === guildId);
  if (!guild || !hasManagePermission(guild.permissions)) {
    sendJson(response, 403, { error: 'guild_forbidden', message: 'You cannot manage this guild.' });
    return null;
  }
  if (!client.guilds.cache.has(guildId)) {
    sendJson(response, 409, { error: 'bot_not_installed', message: 'The bot is not installed in this guild.' });
    return null;
  }
  return { session, guild };
}

function requireSession(request, response, store, config) {
  const cookies = parseCookies(request.headers.cookie || '');
  const sessionToken = cookies[SESSION_COOKIE];
  const session = store.getSession(sessionToken ? hashToken(sessionToken, config.dashboardSessionSecret) : null);
  if (!session) {
    sendJson(response, 401, { error: 'unauthorized', message: 'Sign in with Discord first.' });
    return null;
  }
  return session;
}

function normalizeSettingsPatch(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new Error('settings body must be an object');
  }

  const patch = {};
  if (Object.hasOwn(body, 'musicChannelId')) patch.musicChannelId = snowflakeOrNull(body.musicChannelId, 'musicChannelId');
  if (Object.hasOwn(body, 'controlRoleId')) patch.controlRoleId = snowflakeOrNull(body.controlRoleId, 'controlRoleId');
  if (Object.hasOwn(body, 'defaultVolume')) {
    if (!Number.isInteger(body.defaultVolume) || body.defaultVolume < 0 || body.defaultVolume > 100) {
      throw new Error('defaultVolume must be an integer between 0 and 100');
    }
    patch.defaultVolume = body.defaultVolume;
  }
  if (Object.hasOwn(body, 'autoplay')) {
    if (typeof body.autoplay !== 'boolean') throw new Error('autoplay must be boolean');
    patch.autoplay = body.autoplay;
  }
  if (Object.hasOwn(body, 'locale')) {
    if (typeof body.locale !== 'string' || !/^[a-z]{2}(?:-[A-Z]{2})?$/u.test(body.locale)) {
      throw new Error('locale must be a valid locale such as id-ID or en-US');
    }
    patch.locale = body.locale;
  }
  return patch;
}

function snowflakeOrNull(value, field) {
  if (value === null || value === '') return null;
  if (typeof value !== 'string' || !/^\d{15,22}$/u.test(value)) throw new Error(`${field} must be a Discord snowflake or null`);
  return value;
}

function hasManagePermission(permissionValue) {
  try {
    const permissions = BigInt(permissionValue || '0');
    return (permissions & MANAGE_GUILD) === MANAGE_GUILD || (permissions & ADMINISTRATOR) === ADMINISTRATOR;
  } catch {
    return false;
  }
}

function sameOrigin(request, config) {
  const origin = request.headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).origin === new URL(config.dashboardPublicUrl).origin;
  } catch {
    return false;
  }
}

function isConfigured(config) {
  return Boolean(
    config.dashboardPublicUrl
      && config.dashboardClientId
      && config.dashboardClientSecret
      && config.dashboardSessionSecret,
  );
}
function allowOAuthAttempt(request) {
  const key = request.socket.remoteAddress || 'unknown';
  const now = Date.now();
  for (const [address, attempt] of oauthAttempts) {
    if (now - attempt.startedAt >= OAUTH_ATTEMPT_WINDOW_MS) oauthAttempts.delete(address);
  }
  const current = oauthAttempts.get(key);
  if (!current) {
    oauthAttempts.set(key, { startedAt: now, count: 1 });
    return true;
  }
  if (current.count >= OAUTH_ATTEMPT_LIMIT) return false;
  current.count += 1;
  return true;
}

function getSession(request, store, config) {
  const cookies = parseCookies(request.headers.cookie || '');
  const token = cookies[SESSION_COOKIE];
  return store.getSession(token ? hashToken(token, config.dashboardSessionSecret) : null);
}

function parseCookies(value) {
  const cookies = {};
  for (const part of value.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    const key = part.slice(0, index).trim();
    if (!key) continue;
    try {
      cookies[key] = decodeURIComponent(part.slice(index + 1).trim());
    } catch {
      continue;
    }
  }
  return cookies;
}

function sessionCookie(token, config) {
  const secure = config.dashboardPublicUrl.startsWith('https://') ? '; Secure' : '';
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${SESSION_TTL_MS / 1000}${secure}`;
}

function clearSessionCookie(config) {
  const secure = config.dashboardPublicUrl.startsWith('https://') ? '; Secure' : '';
  return `${SESSION_COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0${secure}`;
}
function oauthStateCookie(stateHash, config) {
  const secure = config.dashboardPublicUrl.startsWith('https://') ? '; Secure' : '';
  return `${OAUTH_COOKIE}=${encodeURIComponent(stateHash)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${OAUTH_STATE_TTL_MS / 1000}${secure}`;
}

function clearOAuthStateCookie(config) {
  const secure = config.dashboardPublicUrl.startsWith('https://') ? '; Secure' : '';
  return `${OAUTH_COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0${secure}`;
}

function randomToken(bytes) {
  return crypto.randomBytes(bytes).toString('base64url');
}

function hashToken(value, secret = 'vibes-dashboard') {
  return crypto.createHmac('sha256', secret).update(value).digest('hex');
}

function encryptSecret(value, secret) {
  const key = crypto.createHash('sha256').update(`vibes-dashboard-token:${secret}`).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), ciphertext].map((part) => part.toString('base64url')).join('.');
}

function decryptSecret(payload, secret) {
  const [ivValue, tagValue, ciphertextValue] = String(payload).split('.');
  if (!ivValue || !tagValue || !ciphertextValue) throw new Error('Invalid encrypted secret');
  const key = crypto.createHash('sha256').update(`vibes-dashboard-token:${secret}`).digest();
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivValue, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextValue, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}
function pkceChallenge(verifier) {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

async function readJsonBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 32 * 1024) throw new Error('request body too large');
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function sendJson(response, status, body) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  response.end(JSON.stringify(body));
}

function sendHtml(response, status, body) {
  response.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  response.end(body);
}

function renderDashboardHtml() {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Vibes Control Center</title>
<style>
:root { color-scheme: dark; font-family: Inter, system-ui, sans-serif; background: #10121a; color: #eef1f7; }
body { margin: 0; background: radial-gradient(circle at top right, #27335b, #10121a 45%); min-height: 100vh; }
main { max-width: 1100px; margin: 0 auto; padding: 32px 20px 64px; }
header { display: flex; justify-content: space-between; align-items: center; gap: 20px; margin-bottom: 28px; }
h1 { margin: 0; font-size: clamp(28px, 5vw, 48px); }
.subtitle { color: #aab4cd; margin-top: 8px; }
button, select, input { border: 1px solid #394462; border-radius: 10px; background: #191e2d; color: #eef1f7; padding: 10px 12px; font: inherit; }
button { cursor: pointer; background: #5865f2; border-color: #6874ff; font-weight: 700; }
button.secondary { background: #20283b; border-color: #3f4d6e; }
a { color: #9da8ff; }
.card { background: rgba(20, 25, 40, .86); border: 1px solid #303b5a; border-radius: 16px; padding: 20px; box-shadow: 0 16px 40px rgba(0,0,0,.18); }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; }
.stack { display: grid; gap: 16px; }
label { display: grid; gap: 6px; color: #b9c3da; }
.status { min-height: 24px; color: #9de3b0; }
.error { color: #ff9f9f; }
.hidden { display: none; }
.metric { font-size: 30px; font-weight: 800; margin-top: 8px; }
small { color: #9ca8c1; }
</style>
</head>
<body>
<main>
<header>
<div><h1>Vibes Control Center</h1><div class="subtitle">Music operations, server settings, and health in one place.</div></div>
<div id="auth"></div>
</header>
<section id="app" class="stack"><div class="card">Loading dashboard…</div></section>
</main>
<script>
let csrfToken = '';
let selectedGuild = '';
const app = document.getElementById('app');
const auth = document.getElementById('auth');
async function api(path, options = {}) {
  const response = await fetch(path, { ...options, headers: { ...(options.headers || {}) } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message || body.error || 'Request failed');
  return body;
}
function escapeHtml(value) { return String(value ?? '').replace(/[&<>'"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
async function boot() {
  try {
    const me = await api('/api/me');
    csrfToken = me.csrfToken;
    auth.innerHTML = '<button id="logout" class="secondary">Sign out</button>';
    document.getElementById('logout').addEventListener('click', async () => {
      await fetch('/auth/logout', { method: 'POST', headers: { 'X-CSRF-Token': csrfToken } });
      location.reload();
    });
    renderGuilds(me.guilds);
  } catch (error) {
    auth.innerHTML = '<a href="/auth/login"><button>Sign in with Discord</button></a>';
    app.innerHTML = '<div class="card"><h2>Connect your Discord</h2><p class="subtitle">Authorize Vibes to see guilds you can manage. The dashboard never receives your bot token.</p></div>';
  }
}
function renderGuilds(guilds) {
  if (!guilds.length) { app.innerHTML = '<div class="card"><h2>No manageable guilds</h2><p class="subtitle">The bot must be installed and your Discord account needs Manage Server or Administrator.</p></div>'; return; }
  selectedGuild = guilds[0].id;
  app.innerHTML = '<div class="card"><label>Server<select id="guild"></select></label></div><div id="details" class="stack"></div>';
  const select = document.getElementById('guild');
  select.innerHTML = guilds.map((guild) => '<option value="'+escapeHtml(guild.id)+'">'+escapeHtml(guild.name)+'</option>').join('');
  select.addEventListener('change', () => { selectedGuild = select.value; loadGuild(); });
  loadGuild();
}
async function loadGuild() {
  const details = document.getElementById('details');
  details.innerHTML = '<div class="card">Loading server data…</div>';
  try {
    const [settings, metrics, audit] = await Promise.all([
      api('/api/guilds/'+selectedGuild+'/settings'),
      api('/api/guilds/'+selectedGuild+'/metrics'),
      api('/api/guilds/'+selectedGuild+'/audit'),
    ]);
    details.innerHTML = '<div class="grid">'+metric('Plays', metrics.plays)+metric('Commands', metrics.commands)+metric('Failures', metrics.failures)+metric('Active days', metrics.days)+'</div>'+
      '<div class="card stack"><h2>Music settings</h2><form id="settings" class="stack">'+
      '<label>Music channel ID<input name="musicChannelId" value="'+escapeHtml(settings.musicChannelId || '')+'" placeholder="Optional Discord channel ID"></label>'+
      '<label>Default volume<input name="defaultVolume" type="number" min="0" max="100" value="'+settings.defaultVolume+'"></label>'+
      '<small>Default volume is applied when a new track starts. Other guild settings are reserved for the next control-policy slice.</small>'+
      '<button type="submit">Save settings</button><div id="status" class="status"></div></form></div>'+
      '<div class="card"><h2>Recent audit</h2><div class="stack">'+(audit.length ? audit.map((entry) => '<div><strong>'+escapeHtml(entry.action)+'</strong><br><small>'+escapeHtml(entry.created_at)+'</small></div>').join('') : '<small>No changes yet.</small>')+'</div></div>';
    document.getElementById('settings').addEventListener('submit', saveSettings);
  } catch (error) { details.innerHTML = '<div class="card error">'+escapeHtml(error.message)+'</div>'; }
}
function metric(label, value) { return '<div class="card"><small>'+label+'</small><div class="metric">'+escapeHtml(value)+'</div></div>'; }
async function saveSettings(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const status = document.getElementById('status');
  const data = Object.fromEntries(new FormData(form));
  data.defaultVolume = Number(data.defaultVolume);
  try {
    await api('/api/guilds/'+selectedGuild+'/settings', { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken }, body: JSON.stringify(data) });
    status.textContent = 'Saved.';
    await loadGuild();
  } catch (error) { status.textContent = error.message; status.className = 'status error'; }
}
boot();
</script>
</body>
</html>`;
}
