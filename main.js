const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const http = require('http');

const VAULT_PATH = path.join(app.getPath('userData'), 'vault.enc');
let vaultKey = null;
let vaultData = null;
let apiToken = null;
let unlocked = false;

function deriveKey(master, salt) {
  return crypto.scryptSync(master, salt, 32, {
    N: 1 << 16, r: 8, p: 1, maxmem: 128 * 1024 * 1024
  });
}

function encrypt(value, key) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(Buffer.from(JSON.stringify(value))), cipher.final()]);
  return {
    iv: iv.toString('base64'),
    ct: ciphertext.toString('base64'),
    tag: cipher.getAuthTag().toString('base64')
  };
}

function decrypt(blob, key) {
  if (!blob || !blob.iv || !blob.ct || !blob.tag) throw new Error('Invalid vault file.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(blob.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(blob.tag, 'base64'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(blob.ct, 'base64')),
    decipher.final()
  ]);
  const value = JSON.parse(plaintext.toString('utf8'));
  if (!value || !Array.isArray(value.entries)) throw new Error('Invalid vault contents.');
  return value;
}

function loadBlob() {
  if (!fs.existsSync(VAULT_PATH)) return null;
  fs.chmodSync(VAULT_PATH, 0o600);
  const blob = JSON.parse(fs.readFileSync(VAULT_PATH, 'utf8'));
  if (!blob || typeof blob.salt !== 'string') throw new Error('Invalid vault file.');
  return blob;
}

function saveBlob(blob) {
  fs.mkdirSync(path.dirname(VAULT_PATH), { recursive: true, mode: 0o700 });
  const temporaryPath = VAULT_PATH + '.' + crypto.randomBytes(6).toString('hex') + '.tmp';
  try {
    fs.writeFileSync(temporaryPath, JSON.stringify(blob), { mode: 0o600, flag: 'wx' });
    fs.renameSync(temporaryPath, VAULT_PATH);
    fs.chmodSync(VAULT_PATH, 0o600);
  } catch (error) {
    try { fs.unlinkSync(temporaryPath); } catch {}
    throw error;
  }
}

function persistVault() {
  if (!vaultData || !vaultKey) throw new Error('locked');
  const blob = loadBlob();
  if (!blob) throw new Error('Vault file is missing.');
  const encrypted = encrypt(vaultData, vaultKey);
  encrypted.salt = blob.salt;
  saveBlob(encrypted);
}

function normalizeSite(value) {
  const raw = String(value || '').trim();
  if (!raw || /\s/.test(raw)) throw new Error('Enter a valid website domain.');
  let url;
  try { url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : 'https://' + raw); }
  catch { throw new Error('Enter a valid website domain.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.port || url.username || url.password ||
      url.search || url.hash || (url.pathname !== '/' && url.pathname !== '')) {
    throw new Error('Enter only the website domain.');
  }
  const host = url.hostname.toLowerCase().replace(/^www\./, '').replace(/\.$/, '');
  if (!host || host.length > 253 ||
      !host.split('.').every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) {
    throw new Error('Invalid website domain.');
  }
  return host;
}

function validateEntry(entry) {
  if (!entry || typeof entry !== 'object') throw new Error('Invalid entry.');
  const site = normalizeSite(entry.site);
  const username = typeof entry.username === 'string' ? entry.username.trim() : '';
  const password = typeof entry.password === 'string' ? entry.password : '';
  if (!username || username.length > 512) throw new Error('Username is required and must be under 512 characters.');
  if (!password || password.length > 4096) throw new Error('Password is required and must be under 4096 characters.');
  return { site, username, password };
}

function saveEntry(entry) {
  if (!vaultData || !vaultKey) throw new Error('locked');
  const value = validateEntry(entry);
  const index = vaultData.entries.findIndex(item => item.site === value.site && item.username === value.username);
  let id;
  if (index >= 0) {
    vaultData.entries[index].password = value.password;
    id = vaultData.entries[index].id;
  } else {
    id = crypto.randomUUID();
    vaultData.entries.push({ id, ...value });
  }
  persistVault();
  return { id, updated: index >= 0 };
}

ipcMain.handle('vault:exists', () => fs.existsSync(VAULT_PATH));

ipcMain.handle('vault:create', (_event, master) => {
  if (fs.existsSync(VAULT_PATH)) throw new Error('vault exists');
  if (typeof master !== 'string' || master.length < 12) {
    throw new Error('Use a master password with at least 12 characters.');
  }
  const salt = crypto.randomBytes(16);
  const key = deriveKey(master, salt);
  const data = { entries: [], createdAt: Date.now() };
  const encrypted = encrypt(data, key);
  encrypted.salt = salt.toString('base64');
  saveBlob(encrypted);
  vaultKey = key;
  vaultData = data;
  unlocked = true;
  return { ok: true };
});

ipcMain.handle('vault:unlock', (_event, master) => {
  if (typeof master !== 'string' || !master) throw new Error('Enter your master password.');
  const blob = loadBlob();
  if (!blob) throw new Error('no vault');
  const salt = Buffer.from(blob.salt, 'base64');
  const key = deriveKey(master, salt);
  let data;
  try { data = decrypt(blob, key); }
  catch { throw new Error('Wrong master password or damaged vault file.'); }
  vaultData = data;
  vaultKey = key;
  unlocked = true;
  return { ok: true };
});

ipcMain.handle('vault:lock', () => {
  vaultKey = null;
  vaultData = null;
  unlocked = false;
  return { ok: true };
});

ipcMain.handle('vault:list', () => {
  if (!vaultData) throw new Error('locked');
  return vaultData.entries.map(({ id, site, username }) => ({ id, site, username }));
});

ipcMain.handle('vault:get', (_event, id) => {
  if (!vaultData) throw new Error('locked');
  const entry = vaultData.entries.find(item => item.id === id);
  if (!entry) throw new Error('not found');
  return entry;
});

ipcMain.handle('vault:add', (_event, entry) => saveEntry(entry));

ipcMain.handle('vault:delete', (_event, id) => {
  if (!vaultData || !vaultKey) throw new Error('locked');
  vaultData.entries = vaultData.entries.filter(item => item.id !== id);
  persistVault();
  return { ok: true };
});

ipcMain.handle('vault:token', () => {
  ensureToken();
  return apiToken;
});

ipcMain.handle('vault:generate', (_event, options) => {
  const requested = Number(options && options.len);
  const length = Number.isInteger(requested) ? Math.min(128, Math.max(8, requested)) : 20;
  const characters = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()-_=+';
  return Array.from({ length }, () => characters[crypto.randomInt(characters.length)]).join('');
});

function createWindow() {
  const window = new BrowserWindow({
    width: 900,
    height: 640,
    icon: path.join(__dirname, 'assets', 'll-512.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  window.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

function ensureToken() {
  const tokenPath = path.join(app.getPath('userData'), 'api.token');
  fs.mkdirSync(path.dirname(tokenPath), { recursive: true, mode: 0o700 });
  if (fs.existsSync(tokenPath)) {
    apiToken = fs.readFileSync(tokenPath, 'utf8').trim();
    fs.chmodSync(tokenPath, 0o600);
  } else {
    apiToken = crypto.randomUUID();
    fs.writeFileSync(tokenPath, apiToken, { mode: 0o600, flag: 'wx' });
  }
  if (!apiToken) throw new Error('Could not load the PassVault API token.');
}

function safeTokenEqual(provided) {
  const actual = Buffer.from(String(provided || ''));
  const expected = Buffer.from(apiToken || '');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function startServer() {
  ensureToken();
  const server = http.createServer(async (request, response) => {
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    if (request.method === 'OPTIONS') { response.writeHead(204); response.end(); return; }

    const authorization = request.headers.authorization || '';
    if (!safeTokenEqual(authorization.startsWith('Bearer ') ? authorization.slice(7) : '')) {
      response.writeHead(401);
      response.end('unauthorized');
      return;
    }
    if (!unlocked || !vaultData) { response.writeHead(403); response.end('locked'); return; }

    const url = new URL(request.url, 'http://127.0.0.1');
    if (request.method === 'GET' && url.pathname === '/status') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ unlocked: true }));
      return;
    }

    if (request.method === 'POST' && url.pathname === '/add') {
      let body = '';
      let tooLarge = false;
      request.on('data', chunk => {
        if (Buffer.byteLength(body) + chunk.length > 32768) {
          tooLarge = true;
          body = '';
        } else if (!tooLarge) body += chunk.toString('utf8');
      });
      await new Promise(resolve => request.on('end', resolve));
      if (tooLarge) { response.writeHead(413); response.end('request too large'); return; }
      let entry;
      try { entry = JSON.parse(body || '{}'); }
      catch { response.writeHead(400); response.end('bad json'); return; }
      try {
        const result = saveEntry(entry);
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify(result));
      } catch (error) {
        response.writeHead(400, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ error: error.message }));
      }
      return;
    }

    if (request.method !== 'GET') { response.writeHead(405); response.end('method not allowed'); return; }
    const requestedSite = (url.searchParams.get('site') || '').toLowerCase();
    const matches = vaultData.entries.filter(entry => {
      const savedSite = (entry.site || '').toLowerCase();
      return !requestedSite || requestedSite === savedSite || requestedSite.endsWith('.' + savedSite);
    });
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify(matches));
  });

  server.on('error', error => console.error('PassVault local API error:', error.message));
  server.listen(47823, '127.0.0.1');
}

app.whenReady().then(() => {
  startServer();
  createWindow();
});
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
