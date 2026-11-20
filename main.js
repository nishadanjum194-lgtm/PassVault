const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const http = require('http');
const { validEntry, generatePassword, safeEqual } = require('./lib/security');

const VAULT_PATH = path.join(app.getPath('userData'), 'vault.enc');
const TOKEN_PATH = path.join(app.getPath('userData'), 'api.token');
const AUTO_LOCK_MS = 5 * 60 * 1000;
let vaultKey = null;
let vaultData = null;
let lastActivity = 0;
let apiToken = null;

function deriveKey(master, salt) {
  return crypto.scryptSync(master, salt, 32, { N: 1 << 16, r: 8, p: 1, maxmem: 128 * 1024 * 1024 });
}
function encrypt(obj, key) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(Buffer.from(JSON.stringify(obj))), cipher.final()]);
  return { iv: iv.toString('base64'), ct: ct.toString('base64'), tag: cipher.getAuthTag().toString('base64') };
}
function decrypt(blob, key) {
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(blob.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(blob.tag, 'base64'));
  return JSON.parse(Buffer.concat([
    decipher.update(Buffer.from(blob.ct, 'base64')),
    decipher.final()
  ]).toString('utf8'));
}
function loadBlob() {
  if (!fs.existsSync(VAULT_PATH)) return null;
  return JSON.parse(fs.readFileSync(VAULT_PATH, 'utf8'));
}
function saveBlob(blob) {
  const tempPath = VAULT_PATH + '.' + crypto.randomUUID() + '.tmp';
  try {
    fs.writeFileSync(tempPath, JSON.stringify(blob), { mode: 0o600, flag: 'wx' });
    fs.renameSync(tempPath, VAULT_PATH);
    try { fs.chmodSync(VAULT_PATH, 0o600); } catch (_error) {}
  } finally {
    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
  }
}
function assertUnlocked() {
  if (!vaultData || !vaultKey) throw new Error('Vault is locked.');
  lastActivity = Date.now();
}
function persistVault() {
  assertUnlocked();
  const existing = loadBlob();
  if (!existing || !existing.salt) throw new Error('Vault file is missing its salt.');
  const encrypted = encrypt(vaultData, vaultKey);
  encrypted.salt = existing.salt;
  saveBlob(encrypted);
}
function lockVault() {
  if (vaultKey) vaultKey.fill(0);
  vaultKey = null;
  vaultData = null;
  lastActivity = 0;
}
function touch() { assertUnlocked(); }

ipcMain.handle('vault:exists', () => fs.existsSync(VAULT_PATH));
ipcMain.handle('vault:create', (_event, master) => {
  if (fs.existsSync(VAULT_PATH)) throw new Error('Vault already exists.');
  if (typeof master !== 'string' || master.length < 12 || master.length > 1024) {
    throw new Error('Master password must be at least 12 characters.');
  }
  const salt = crypto.randomBytes(16);
  const key = deriveKey(master, salt);
  const data = { entries: [], createdAt: Date.now() };
  const blob = encrypt(data, key);
  blob.salt = salt.toString('base64');
  saveBlob(blob);
  vaultKey = key;
  vaultData = data;
  lastActivity = Date.now();
  return { ok: true };
});
ipcMain.handle('vault:unlock', (_event, master) => {
  if (typeof master !== 'string' || master.length > 1024) throw new Error('Invalid master password.');
  const blob = loadBlob();
  if (!blob) throw new Error('No vault exists.');
  try {
    const key = deriveKey(master, Buffer.from(blob.salt, 'base64'));
    const data = decrypt(blob, key);
    if (!data || !Array.isArray(data.entries)) throw new Error('Invalid vault format.');
    vaultKey = key;
    vaultData = data;
    lastActivity = Date.now();
  } catch (_error) {
    throw new Error('Incorrect master password or damaged vault.');
  }
  return { ok: true };
});
ipcMain.handle('vault:lock', () => { lockVault(); return { ok: true }; });
ipcMain.handle('vault:list', () => {
  touch();
  return vaultData.entries.map(({ id, site, username }) => ({ id, site, username }));
});
ipcMain.handle('vault:get', (_event, id) => {
  touch();
  const entry = vaultData.entries.find((item) => item.id === id);
  if (!entry) throw new Error('Entry not found.');
  return { ...entry };
});
ipcMain.handle('vault:add', (_event, entry) => {
  touch();
  if (!validEntry(entry)) throw new Error('Entry must include a valid site, username, and password.');
  const id = crypto.randomUUID();
  vaultData.entries.push({ id, site: entry.site.trim(), username: entry.username, password: entry.password });
  persistVault();
  return { id };
});
ipcMain.handle('vault:delete', (_event, id) => {
  touch();
  const before = vaultData.entries.length;
  vaultData.entries = vaultData.entries.filter((entry) => entry.id !== id);
  if (vaultData.entries.length === before) throw new Error('Entry not found.');
  persistVault();
  return { ok: true };
});
ipcMain.handle('vault:token', () => {
  touch();
  ensureToken();
  return apiToken;
});
ipcMain.handle('vault:generate', (_event, opts) => {
  const length = Math.max(12, Math.min(128, Math.trunc(Number(opts && opts.len) || 20)));
  return generatePassword(length);
});

function ensureToken() {
  if (apiToken) return;
  if (fs.existsSync(TOKEN_PATH)) {
    apiToken = fs.readFileSync(TOKEN_PATH, 'utf8').trim();
  } else {
    apiToken = crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(TOKEN_PATH, apiToken, { mode: 0o600, flag: 'wx' });
  }
}
function sendJson(res, status, value) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(value));
}
function startServer() {
  ensureToken();
  const allowedOrigin = (origin) => !origin || origin.startsWith('chrome-extension://') || origin.startsWith('moz-extension://');
  const server = http.createServer((req, res) => {
    const origin = req.headers.origin || '';
    if (!allowedOrigin(origin)) return sendJson(res, 403, { error: 'Origin not allowed.' });
    if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

    const authorization = req.headers.authorization || '';
    if (!safeEqual(authorization, 'Bearer ' + apiToken)) return sendJson(res, 401, { error: 'Unauthorized.' });
    if (!vaultData || !vaultKey) return sendJson(res, 403, { error: 'Vault is locked.' });
    lastActivity = Date.now();

    let parsed;
    try { parsed = new URL(req.url, 'http://127.0.0.1'); }
    catch (_error) { return sendJson(res, 400, { error: 'Invalid URL.' }); }

    if (req.method === 'GET' && parsed.pathname === '/status') {
      return sendJson(res, 200, { unlocked: true });
    }
    if (req.method === 'POST' && parsed.pathname === '/add') {
      let body = '';
      let tooLarge = false;
      req.on('data', (chunk) => {
        body += chunk;
        if (Buffer.byteLength(body) > 8192) {
          tooLarge = true;
          req.destroy();
        }
      });
      req.on('end', () => {
        if (tooLarge) return sendJson(res, 413, { error: 'Request body too large.' });
        let entry;
        try { entry = JSON.parse(body || '{}'); }
        catch (_error) { return sendJson(res, 400, { error: 'Invalid JSON.' }); }
        if (!validEntry(entry)) return sendJson(res, 400, { error: 'Invalid entry.' });
        try {
          const id = crypto.randomUUID();
          vaultData.entries.push({ id, site: entry.site.trim(), username: entry.username, password: entry.password });
          persistVault();
          return sendJson(res, 201, { id });
        } catch (error) {
          return sendJson(res, 500, { error: 'Could not save entry.' });
        }
      });
      return;
    }
    if (req.method === 'GET' && parsed.pathname === '/') {
      const site = (parsed.searchParams.get('site') || '').trim().toLowerCase();
      if (!site || site.length > 253) return sendJson(res, 400, { error: 'A site hostname is required.' });
      const matches = vaultData.entries.filter((entry) => (entry.site || '').toLowerCase() === site);
      return sendJson(res, 200, matches);
    }
    if (req.method !== 'GET') return sendJson(res, 405, { error: 'Method not allowed.' });
    return sendJson(res, 404, { error: 'Not found.' });
  });
  server.requestTimeout = 10000;
  server.headersTimeout = 5000;
  server.listen(47823, '127.0.0.1');
}
function createWindow() {
  const win = new BrowserWindow({
    width: 900,
    height: 640,
    icon: path.join(__dirname, 'assets', 'll-512.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}
app.whenReady().then(() => { startServer(); createWindow(); });
setInterval(() => {
  if (vaultData && lastActivity && Date.now() - lastActivity > AUTO_LOCK_MS) lockVault();
}, 15000).unref();
app.on('window-all-closed', () => { if (process.platform !== 'darwin') { lockVault(); app.quit(); } });
app.on('before-quit', lockVault);
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
