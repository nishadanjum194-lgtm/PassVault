const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const VAULT_PATH = path.join(app.getPath('userData'), 'vault.enc');
let vaultKey = null;
let vaultData = null;

function deriveKey(master, salt) {
  return crypto.scryptSync(master, salt, 32, { N: 1 << 16, r: 8, p: 1, maxmem: 128 * 1024 * 1024 });
}
function encrypt(obj, key) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(Buffer.from(JSON.stringify(obj))), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { iv: iv.toString('base64'), ct: ct.toString('base64'), tag: tag.toString('base64') };
}
function decrypt(blob, key) {
  const iv = Buffer.from(blob.iv, 'base64');
  const ct = Buffer.from(blob.ct, 'base64');
  const tag = Buffer.from(blob.tag, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([decipher.update(ct), decipher.final()]).toString());
}
function loadBlob() { if (!fs.existsSync(VAULT_PATH)) return null; return JSON.parse(fs.readFileSync(VAULT_PATH,'utf8')); }
function saveBlob(blob) { fs.writeFileSync(VAULT_PATH, JSON.stringify(blob)); }

ipcMain.handle('vault:exists', () => fs.existsSync(VAULT_PATH));
ipcMain.handle('vault:create', (e, master) => {
  if (fs.existsSync(VAULT_PATH)) throw new Error('vault exists');
  const salt = crypto.randomBytes(16);
  const key = deriveKey(master, salt);
  const data = { entries: [], createdAt: Date.now() };
  const enc = encrypt(data, key); enc.salt = salt.toString('base64');
  saveBlob(enc); vaultKey = key; vaultData = data; unlocked = true; return { ok: true };
});
ipcMain.handle('vault:unlock', (e, master) => {
  const blob = loadBlob(); if (!blob) throw new Error('no vault');
  const salt = Buffer.from(blob.salt,'base64'); const key = deriveKey(master, salt);
  try { vaultData = decrypt({ iv: blob.iv, ct: blob.ct, tag: blob.tag }, key); }
  catch (err) { throw new Error('wrong master password'); }
  vaultKey = key; unlocked = true; return { ok: true };
});
ipcMain.handle('vault:lock', () => { vaultKey=null; vaultData=null; unlocked=false; return {ok:true}; });
ipcMain.handle('vault:list', () => { if (!vaultData) throw new Error('locked'); return vaultData.entries.map(({id,site,username})=>({id,site,username})); });
ipcMain.handle('vault:get', (e, id) => { if (!vaultData) throw new Error('locked'); const en=vaultData.entries.find(x=>x.id===id); if(!en) throw new Error('not found'); return en; });
ipcMain.handle('vault:add', (e, entry) => {
  if (!vaultData||!vaultKey) throw new Error('locked');
  const id = crypto.randomUUID(); vaultData.entries.push({id,...entry});
  const salt = Buffer.from(loadBlob().salt,'base64'); const enc = encrypt(vaultData, vaultKey); enc.salt = salt.toString('base64'); saveBlob(enc); return {id};
});
ipcMain.handle('vault:delete', (e, id) => {
  if (!vaultData||!vaultKey) throw new Error('locked');
  vaultData.entries = vaultData.entries.filter(x=>x.id!==id);
  const salt = Buffer.from(loadBlob().salt,'base64'); const enc = encrypt(vaultData, vaultKey); enc.salt = salt.toString('base64'); saveBlob(enc); return {ok:true};
});
ipcMain.handle('vault:token', () => { ensureToken(); return apiToken; });
ipcMain.handle('vault:generate', (e, opts) => {
  const len=(opts&&opts.len)||20; const chars='abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()-_=+';
  let out=''; const b=crypto.randomBytes(len); for(let i=0;i<len;i++) out+=chars[b[i]%chars.length]; return out;
});

function createWindow(){
  const win=new BrowserWindow({width:900,height:640,webPreferences:{preload:path.join(__dirname,'preload.js'),contextIsolation:true,nodeIntegration:false}});
  win.loadFile('renderer/index.html');
}
let apiToken = null;
let unlocked = false;
const http = require('http');

function ensureToken() {
  const p = path.join(app.getPath('userData'), 'api.token');
  if (fs.existsSync(p)) apiToken = fs.readFileSync(p,'utf8').trim();
  else { apiToken = crypto.randomUUID(); fs.writeFileSync(p, apiToken); }
}

function startServer() {
  ensureToken();
  const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
    const authz = req.headers['authorization'] || '';
    if (authz !== 'Bearer ' + apiToken) { res.writeHead(401); res.end('unauthorized'); return; }
    if (!unlocked || !vaultData) { res.writeHead(403); res.end('locked'); return; }
    if (req.url === '/status') { res.writeHead(200); res.end(JSON.stringify({unlocked:true})); return; }
    const u = new URL(req.url, 'http://x');
    const site = (u.searchParams.get('site') || '').toLowerCase();
    const matches = vaultData.entries.filter(e => (e.site||'').toLowerCase().includes(site) || site.includes((e.site||'').toLowerCase()));
    res.writeHead(200, {'Content-Type':'application/json'});
    res.end(JSON.stringify(matches));
  });
  server.listen(47823, '127.0.0.1');
}
// start server on ready
app.whenReady().then(() => { startServer(); createWindow(); });
app.on('window-all-closed',()=>{ if(process.platform!=='darwin') app.quit(); });
app.on('activate',()=>{ if(BrowserWindow.getAllWindows().length===0) createWindow(); });