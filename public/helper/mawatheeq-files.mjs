#!/usr/bin/env node
// برنامج الملفات لمواثيق (Mawatheeq Files): lets «الملفات» work in any browser (Zen, Firefox, Chrome…), owner,
// 12 November 2026: «make me use zen as well … don't delete originals».
//
// It runs on an office computer that sees the network share, and works only inside the four folders set from the
// app (الوارد، المسح اليومي، ملفات القضايا، أوامر الأداء). It lists them, sends a file to the browser for a preview,
// and copies a file into its place. It never deletes, moves or overwrites a file: a copy goes under a free name, and a
// file already there with the same name and size is left as it is.
//
// Safety: it listens on this computer only (127.0.0.1), answers only Mawatheeq's own pages, and refuses any path that
// leaves the folders it was given. Nothing goes to the internet.
//
// Usage: node mawatheeq-files.mjs          (Node.js 18 or later; no packages to install)
// Settings live in mawatheeq-files.json next to this file (the folders are chosen from the app).
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const VERSION = '1.0.0';
export const ROOT_KEYS = ['inbox', 'daily', 'cases', 'orders'];
const DEFAULT_PORT = 47821;
const DEFAULT_ORIGINS = ['https://psychonator1000.github.io', 'http://localhost:8080', 'http://127.0.0.1:8080', 'http://localhost:4175', 'http://127.0.0.1:4175'];
const TYPES = { '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.tif': 'image/tiff', '.tiff': 'image/tiff', '.json': 'application/json' };

/** A folder or file name that stays inside its folder: no separators, no «.» or «..», nothing Windows refuses. */
export function safePart(p) {
  const s = String(p ?? '');
  if (!s || s === '.' || s === '..' || s.length > 200 || /[\\/:*?"<>|\u0000-\u001f]/.test(s)) throw Object.assign(new Error('اسم غير صالح: ' + s.slice(0, 40)), { status: 400 });
  return s;
}
/** «a/b/c» → ['a','b','c'], each part checked. */
export const parts = p => String(p || '').split('/').filter(x => x !== '').map(safePart);

export function createFilesServer({ configPath, port = DEFAULT_PORT, origins = DEFAULT_ORIGINS, log = () => {} } = {}) {
  let config = { roots: {} };
  try { config = { roots: {}, ...JSON.parse(fs.readFileSync(configPath, 'utf8')) }; } catch { /* First run: no folders yet. */ }
  const allowed = new Set([...origins, ...(config.origins || [])]);
  const save = () => fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

  async function rootDir(key) {
    if (!ROOT_KEYS.includes(key)) throw Object.assign(new Error('مجلد غير معروف.'), { status: 400 });
    const dir = config.roots[key];
    if (!dir) throw Object.assign(new Error('لم يُحدد هذا المجلد في برنامج الملفات بعد.'), { status: 409 });
    return dir;
  }
  /** The real path of a place inside a root; refuses anything that ends up outside it (links included). */
  async function inside(key, rel, { create = false } = {}) {
    const base = await rootDir(key), target = path.join(base, ...rel);
    if (create) await fsp.mkdir(target, { recursive: true });
    const [realBase, realTarget] = await Promise.all([fsp.realpath(base), fsp.realpath(target)]);
    const r = path.relative(realBase, realTarget);
    if (r.startsWith('..') || path.isAbsolute(r)) throw Object.assign(new Error('المسار خارج المجلد.'), { status: 403 });
    return realTarget;
  }
  async function status() {
    const roots = {};
    for (const k of ROOT_KEYS) {
      const p = config.roots[k];
      roots[k] = { path: p || '', ok: !!p && await fsp.stat(p).then(s => s.isDirectory(), () => false) };
    }
    return { app: 'mawatheeq-files', version: VERSION, roots };
  }
  async function list(key, rel) {
    const dir = await inside(key, rel), out = [];
    for (const e of await fsp.readdir(dir, { withFileTypes: true })) {
      if (!e.isFile() && !e.isDirectory()) continue;
      try { const s = await fsp.stat(path.join(dir, e.name)); out.push({ name: e.name, kind: e.isDirectory() ? 'dir' : 'file', size: e.isDirectory() ? 0 : s.size, modified: Math.round(s.mtimeMs) }); }
      catch { /* Gone or unreadable: left out. */ }
    }
    return out;
  }
  /** Copies a file into a folder (made if needed). Never overwrites: the same name and size is «already there», otherwise «name (2).pdf». The original stays. */
  async function copy(from, to, name) {
    const src = await inside(from.root, parts(from.path));
    const s = await fsp.stat(src);
    if (!s.isFile()) throw Object.assign(new Error('ليس ملفاً.'), { status: 400 });
    const dir = await inside(to.root, parts(to.path), { create: true }), want = safePart(name);
    const ext = path.extname(want), stem = want.slice(0, want.length - ext.length);
    for (let i = 1; i < 1000; i++) {
      const n = i === 1 ? want : `${stem} (${i})${ext}`, dest = path.join(dir, n);
      const there = await fsp.stat(dest).catch(() => null);
      if (there) { if (there.isFile() && there.size === s.size) return { name: n, copied: false }; continue; }
      try { await fsp.copyFile(src, dest, fs.constants.COPYFILE_EXCL); }
      catch (e) { if (e.code === 'EEXIST') continue; throw e; }
      // Keep the scan's own date, so a copy filed by day sorts and reads like the original.
      await fsp.utimes(dest, s.atime, s.mtime).catch(() => {});
      if ((await fsp.stat(dest)).size !== s.size) throw new Error('لم تكتمل نسخة الملف.');
      return { name: n, copied: true };
    }
    throw new Error('يوجد ملفات كثيرة بالاسم نفسه في هذا المجلد.');
  }
  /** The app's own small notes (which scan went where): only hidden «.mawatheeq…json» files, at the top of a folder. */
  async function writeNote(key, name, text) {
    if (!/^\.mawatheeq[a-z-]*\.json$/.test(name)) throw Object.assign(new Error('ملف غير مسموح.'), { status: 403 });
    if (String(text).length > 5_000_000) throw Object.assign(new Error('الملف كبير جداً.'), { status: 413 });
    try { JSON.parse(text); } catch { throw Object.assign(new Error('ملاحظة غير صالحة.'), { status: 400 }); }
    const dir = await inside(key, []), dest = path.join(dir, name), tmp = dest + '.tmp';
    await fsp.writeFile(tmp, text); await fsp.rename(tmp, dest);
    return { ok: true };
  }
  async function setRoots(body) {
    const next = { ...config.roots };
    for (const k of ROOT_KEYS) if (typeof body?.[k] === 'string') {
      const p = body[k].trim();
      if (!p) { delete next[k]; continue; }
      if (!path.isAbsolute(p)) throw Object.assign(new Error(`اكتب المسار الكامل لمجلد ${k} (مثل Z:\\الوارد أو \\\\SERVER\\Share\\الوارد).`), { status: 400 });
      const st = await fsp.stat(p).catch(() => null);
      if (!st?.isDirectory()) throw Object.assign(new Error('لا يوجد مجلد بهذا المسار على هذا الجهاز: ' + p), { status: 400 });
      next[k] = p;
    }
    config.roots = next; save();
    log('حُفظت المجلدات.');
    return status();
  }

  const readBody = req => new Promise((resolve, reject) => {
    let n = 0; const chunks = [];
    req.on('data', c => { n += c.length; if (n > 6_000_000) { reject(Object.assign(new Error('الطلب كبير جداً.'), { status: 413 })); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch { reject(Object.assign(new Error('طلب غير صالح.'), { status: 400 })); } });
    req.on('error', reject);
  });

  const server = http.createServer(async (req, res) => {
    const origin = req.headers.origin, host = String(req.headers.host || '');
    // Only this computer's own address (no other name pointing here), and only Mawatheeq's pages.
    if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host)) { res.writeHead(421).end(); return; }
    const cors = origin && allowed.has(origin) ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin', 'Access-Control-Allow-Private-Network': 'true' } : {};
    if (req.method === 'OPTIONS') {
      if (!cors['Access-Control-Allow-Origin']) { res.writeHead(403).end(); return; }
      res.writeHead(204, { ...cors, 'Access-Control-Allow-Methods': 'GET, POST, PUT', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '600' }).end(); return;
    }
    const url = new URL(req.url, 'http://127.0.0.1');
    // A page of another site gets nothing; opening the status in the address bar (no origin) shows that it runs.
    if (origin ? !cors['Access-Control-Allow-Origin'] : !(req.method === 'GET' && url.pathname === '/status')) { res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' }).end('مرفوض'); return; }
    const json = (code, data) => { res.writeHead(code, { ...cors, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); };
    try {
      if (req.method === 'GET' && url.pathname === '/status') return json(200, await status());
      if (req.method === 'PUT' && url.pathname === '/roots') return json(200, await setRoots(await readBody(req)));
      if (req.method === 'GET' && url.pathname === '/list') return json(200, await list(url.searchParams.get('root'), parts(url.searchParams.get('path'))));
      if (req.method === 'GET' && url.pathname === '/read') {
        const file = await inside(url.searchParams.get('root'), parts(url.searchParams.get('path'))), st = await fsp.stat(file);
        if (!st.isFile()) return json(400, { error: 'ليس ملفاً.' });
        res.writeHead(200, { ...cors, 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Content-Length': st.size, 'Cache-Control': 'no-store' });
        fs.createReadStream(file).on('error', () => res.destroy()).pipe(res); return;
      }
      if (req.method === 'POST' && url.pathname === '/copy') { const b = await readBody(req); return json(200, await copy(b.from || {}, b.to || {}, b.name)); }
      if (req.method === 'POST' && url.pathname === '/note') { const b = await readBody(req); return json(200, await writeNote(b.root, String(b.name || ''), String(b.text ?? ''))); }
      return json(404, { error: 'غير موجود.' });
    } catch (e) {
      const code = e.status || (e.code === 'ENOENT' ? 404 : e.code === 'EACCES' || e.code === 'EPERM' ? 403 : 500);
      if (code >= 500) log('خطأ: ' + e.message);
      return json(code, { error: e.code === 'ENOENT' ? 'الملف أو المجلد غير موجود.' : e.code === 'EACCES' || e.code === 'EPERM' ? 'لا يملك هذا الجهاز إذن الوصول إلى هذا المسار.' : e.message });
    }
  });
  return { server, listen: () => new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', () => resolve(server.address().port)); }) };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const port = Number(process.env.MAWATHEEQ_FILES_PORT) || DEFAULT_PORT;
  const configPath = process.env.MAWATHEEQ_FILES_CONFIG || path.join(here, 'mawatheeq-files.json');
  const stamp = () => new Date().toLocaleString('en-GB'), log = m => console.log(`[${stamp()}] ${m}`);
  createFilesServer({ configPath, port, log }).listen().then(p => {
    log(`برنامج الملفات لمواثيق ${VERSION} يعمل. افتح صفحة «الملفات» في مواثيق من هذا الجهاز. (http://127.0.0.1:${p})`);
    log('لا تغلق هذه النافذة أثناء العمل على الملفات.');
  }, e => { if (e.code === 'EADDRINUSE') { console.error('برنامج الملفات يعمل بالفعل على هذا الجهاز.'); process.exit(3); } console.error(e.message); process.exit(1); });
}
